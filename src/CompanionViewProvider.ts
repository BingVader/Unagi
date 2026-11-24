import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { CompanionAlert } from './DesktopCompanion';
import { CharacterDef, DEFAULT_CHARACTER, LineKey, SCENARIOS, fillLine, getCharacter, loadCharacters, mergeLines, pickLine } from './characters';
import { deleteCustomCharacter } from './CharacterStudio';
import { QuoteService, formatQuote } from './Quotes';

/** A character as the webview needs it: asset paths already turned into webview URIs. */
export interface WebviewCharacter {
  id: string;
  name: string;
  kind: 'vector' | 'sprite' | 'photo';
  facing: 'left' | 'right';
  height: number;
  anims: Record<string, { url: string; frames: number; w: number; h: number; frameMs: number; loop: boolean }>;
  image?: { url: string; w: number; h: number };
  lines: CharacterDef['lines'];
}

export interface SprintTask {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'inprogress' | 'done';
  createdAt: number;
}

export type SprintType = 'personal' | 'work';
export type SprintRepeat = 'none' | 'daily';

export interface SprintData {
  id: string;
  name: string;
  /** Personal tasks or work tasks. */
  type: SprintType;
  /** 'daily' sprints start over (all tasks back to "to do") every new day. */
  repeat: SprintRepeat;
  startDate: string;
  endDate: string;
  /** Local date (YYYY-MM-DD) a daily sprint last started over. */
  lastReset?: string;
  /** Consecutive days a daily sprint was fully completed. */
  streak?: number;
  tasks: SprintTask[];
}

export interface TimerState {
  isRunning: boolean;
  timeLeft: number;
  totalTime: number;
  mode: 'focus' | 'break' | 'idle';
  round: number;
}

export interface DeskState {
  sprints: SprintData[];
  activeSprintId: string;
  notes: string;
  timer: TimerState;
}

export type DeskMessageType =
  | { type: 'sync'; state: DeskState }
  | { type: 'timerAlert'; message: string }
  | { type: 'taskReminder'; pendingCount: number }
  | { type: 'say'; text: string; mood?: 'alert' | 'angry' | 'happy'; sticky?: boolean; goto?: string; tab?: string }
  | { type: 'water'; enabled: boolean; intervalMinutes: number }
  | { type: 'config'; config: { enabled: boolean; movement: 'free' | 'floor'; character: WebviewCharacter } }
  | { type: 'companionPanel'; data: CompanionPanelData };

/** What the sidebar's Companion tab needs to draw itself. */
export interface CompanionPanelData {
  current: string;
  characters: Array<{
    id: string;
    name: string;
    kind: 'vector' | 'sprite' | 'photo';
    custom: boolean;
    /** First frame of the character, for the picker card. Vector characters draw themselves. */
    thumb?: { url: string; w: number; h: number; frames: number };
  }>;
  settings: {
    enabled: boolean;
    movement: 'free' | 'floor';
    desktop: boolean;
    desktopSupported: boolean;
  };
  /** Editable dialogue of the current character, one entry per scenario. */
  dialogue: {
    character: string;
    scenarios: Array<{ key: string; label: string; hint: string; vars: string[]; lines: string[]; custom: boolean }>;
  };
}

/** Per-character dialogue the user has rewritten: { characterId: { scenarioKey: [lines] } }. */
type DialogueOverrides = Record<string, Partial<Record<LineKey, string[]>>>;

const localDate = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const isoDay = (offsetDays = 0): string => localDate(new Date(Date.now() + offsetDays * 86400000));

/** Anything that owns a webview and can be disposed: a sidebar view or an editor panel. */
interface WebviewHost {
  readonly webview: vscode.Webview;
  readonly onDidDispose: vscode.Event<void>;
}

export class CompanionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'unagi.view';

  private _webviews = new Set<vscode.Webview>();
  private _panel?: vscode.WebviewPanel;
  private _userDir?: string;
  private readonly _alertEmitter = new vscode.EventEmitter<CompanionAlert>();
  /** Fires for every alert / task notification the companion should announce. */
  public readonly onDidAlert = this._alertEmitter.event;
  private readonly _dialogueEmitter = new vscode.EventEmitter<void>();
  /** Fires when the user edits the companion's dialogue. */
  public readonly onDidChangeDialogue = this._dialogueEmitter.event;
  private _statusBarItem?: vscode.StatusBarItem;
  private _tickerInterval?: NodeJS.Timeout;
  private _lastReminderCheck = Date.now();
  private _lastWater = Date.now();
  private _lastQuote = Date.now();
  private readonly _quotes = new QuoteService();
  private _today = localDate();
  private _dialogue: DialogueOverrides = {};

  private _state: DeskState = this._defaultState();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _globalState: vscode.Memento
  ) {
    this._loadPersistedData();
    this._rolloverDaily(false);
    this._startBackgroundTicker();
  }

  public setStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    this._statusBarItem = statusBarItem;
    this._updateStatusBar();
  }

  private _defaultState(): DeskState {
    const today = isoDay();
    return {
      sprints: [
        {
          id: 'work-1',
          name: 'Sprint 14: Core Features',
          type: 'work',
          repeat: 'none',
          startDate: today,
          endDate: isoDay(7),
          tasks: [
            { id: '1', text: 'Implement user authentication & session management', priority: 'high', status: 'done', createdAt: Date.now() - 3600000 },
            { id: '2', text: 'Connect database migrations and schema indexes', priority: 'high', status: 'inprogress', createdAt: Date.now() - 2400000 },
            { id: '3', text: 'Write end-to-end integration tests for API endpoints', priority: 'medium', status: 'todo', createdAt: Date.now() - 1200000 },
            { id: '4', text: 'Review pull requests and update technical docs', priority: 'low', status: 'todo', createdAt: Date.now() }
          ]
        },
        {
          id: 'personal-1',
          name: 'Daily Routine',
          type: 'personal',
          repeat: 'daily',
          startDate: today,
          endDate: today,
          lastReset: today,
          streak: 0,
          tasks: [
            { id: 'p1', text: 'Stretch and take a short walk', priority: 'medium', status: 'todo', createdAt: Date.now() - 2000 },
            { id: 'p2', text: 'Plan tomorrow before logging off', priority: 'low', status: 'todo', createdAt: Date.now() - 1000 }
          ]
        }
      ],
      activeSprintId: 'work-1',
      notes: `# UNAGI: Total Awareness ⚡🍣\n\n"Unagi is a state of total awareness. Only by achieving true Unagi can you be prepared for any danger that may befall you."\n\n## Quick Sprint Notes:\n- [ ] Check API rate limits before deploy\n- [ ] Verify database connection pool sizing\n\n\`\`\`ts\n// Unagi flow\nconst state = "Total Awareness";\n\`\`\`\n`,
      timer: {
        isRunning: false,
        timeLeft: 25 * 60,
        totalTime: 25 * 60,
        mode: 'idle',
        round: 1
      }
    };
  }

  private _loadPersistedData(): void {
    const sprints = this._globalState.get<SprintData[]>('unagi.sprints');
    if (Array.isArray(sprints) && sprints.length) {
      this._state.sprints = this._sanitizeSprints(sprints, sprints);
      const active = this._globalState.get<string>('unagi.activeSprint');
      this._state.activeSprintId = active && this._state.sprints.some(sp => sp.id === active) ? active : this._state.sprints[0].id;
    } else {
      // Older versions kept a single sprint; it becomes a one-off work sprint.
      const legacy = this._globalState.get<any>('unagi.sprint') || this._globalState.get<any>('sprintdesk.sprint');
      if (legacy && Array.isArray(legacy.tasks)) {
        this._state.sprints = this._sanitizeSprints([{ ...legacy, id: 'work-1', type: 'work', repeat: 'none' }], []);
        this._state.activeSprintId = this._state.sprints[0].id;
      }
    }

    const sNotes = this._globalState.get<string>('unagi.notes') || this._globalState.get<string>('sprintdesk.notes');
    if (typeof sNotes === 'string') this._state.notes = sNotes;

    const sTimer = this._globalState.get<TimerState>('unagi.timer') || this._globalState.get<TimerState>('sprintdesk.timer');
    if (sTimer) this._state.timer = sTimer;

    const dlg = this._globalState.get<DialogueOverrides>('unagi.dialogue');
    if (dlg && typeof dlg === 'object') this._dialogue = dlg;
  }

  private async _persistData(): Promise<void> {
    await this._globalState.update('unagi.sprints', this._state.sprints);
    await this._globalState.update('unagi.activeSprint', this._state.activeSprintId);
    await this._globalState.update('unagi.notes', this._state.notes);
    await this._globalState.update('unagi.timer', this._state.timer);
  }

  /**
   * Validate sprints coming from a webview (or storage). The daily-reset bookkeeping
   * (lastReset, streak) is host-owned: it is taken from `existing`, never from the webview.
   */
  private _sanitizeSprints(raw: unknown, existing: SprintData[]): SprintData[] {
    if (!Array.isArray(raw)) return existing;
    const str = (v: unknown, max: number, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
    const today = isoDay();
    const out: SprintData[] = [];
    for (const r of raw.slice(0, 30)) {
      if (!r || typeof r !== 'object') continue;
      const id = str(r.id, 40, '') || `s${Date.now()}${out.length}`;
      if (out.some(sp => sp.id === id)) continue;
      const old = existing.find(sp => sp.id === id);
      const repeat: SprintRepeat = r.repeat === 'daily' ? 'daily' : 'none';
      const tasks: SprintTask[] = (Array.isArray(r.tasks) ? r.tasks : []).slice(0, 500)
        .filter((t: any) => t && typeof t === 'object')
        .map((t: any, i: number): SprintTask => ({
          id: str(t.id, 40, `t${Date.now()}${i}`),
          text: str(t.text, 300, '(untitled)'),
          priority: (['high', 'medium', 'low'].includes(t.priority) ? t.priority : 'medium') as SprintTask['priority'],
          status: (['todo', 'inprogress', 'done'].includes(t.status) ? t.status : 'todo') as SprintTask['status'],
          createdAt: Number(t.createdAt) || Date.now()
        }));
      const lastReset = repeat === 'daily' ? (old?.lastReset ?? today) : undefined;
      out.push({
        id,
        name: str(r.name, 60, 'Sprint'),
        type: r.type === 'personal' ? 'personal' : 'work',
        repeat,
        startDate: repeat === 'daily' ? (lastReset as string) : str(r.startDate, 10, today),
        endDate: repeat === 'daily' ? (lastReset as string) : str(r.endDate, 10, isoDay(7)),
        lastReset,
        streak: repeat === 'daily' ? (old?.streak ?? 0) : undefined,
        tasks
      });
    }
    return out.length ? out : existing;
  }

  private get _activeSprint(): SprintData {
    return this._state.sprints.find(sp => sp.id === this._state.activeSprintId) ?? this._state.sprints[0];
  }

  /** Daily sprints start over on a new day: every task goes back to "to do" and the streak is updated. */
  private _rolloverDaily(announce: boolean): void {
    const today = isoDay();
    this._today = today;
    let changed = false;
    for (const sp of this._state.sprints) {
      if (sp.repeat !== 'daily' || sp.lastReset === today) continue;
      if (sp.lastReset) {
        const wasComplete = sp.tasks.length > 0 && sp.tasks.every(t => t.status === 'done');
        sp.streak = wasComplete ? (sp.streak ?? 0) + 1 : 0;
        sp.tasks.forEach(t => { t.status = 'todo'; });
      }
      sp.lastReset = today;
      sp.startDate = today;
      sp.endDate = today;
      changed = true;
      if (announce && sp.tasks.length) {
        this._say(this._line('newDay', { sprint: sp.name, p: sp.tasks.length }), { mood: 'happy', tab: 'sprint' });
      }
    }
    if (changed) {
      void this._persistData();
      this._broadcastSync();
    }
  }

  private _startBackgroundTicker(): void {
    if (this._tickerInterval) clearInterval(this._tickerInterval);

    this._tickerInterval = setInterval(() => {
      let needsSync = false;

      // 1. Timer countdown
      if (this._state.timer.isRunning) {
        this._state.timer.timeLeft--;
        needsSync = true;

        if (this._state.timer.timeLeft <= 0) {
          this._handleTimerComplete();
        }
      }

      // 2. Daily sprints start over when the date changes
      if (isoDay() !== this._today) this._rolloverDaily(true);

      // 3. Periodic task reminder check (every configured interval)
      const config = vscode.workspace.getConfiguration('unagi');
      const reminderMins = config.get<number>('reminderIntervalMinutes', 30);
      const enableReminders = config.get<boolean>('enableTaskReminders', true);

      if (enableReminders && (Date.now() - this._lastReminderCheck) >= reminderMins * 60000) {
        this._lastReminderCheck = Date.now();
        this._checkTaskReminders();
      }

      // 4. Water reminder
      const water = this._waterConfig();
      if (water.enabled && (Date.now() - this._lastWater) >= water.intervalMinutes * 60000) {
        this._lastWater = Date.now();
        this._remindWater();
      }

      // 5. A random quote now and then
      const quotes = this._quoteConfig();
      if (quotes.enabled && (Date.now() - this._lastQuote) >= quotes.intervalMinutes * 60000) {
        this.sayQuote();
      }

      this._updateStatusBar();

      if (needsSync) {
        this._broadcastSync();
      }
    }, 1000);
  }

  // ---------------------------------------------------------------
  // Dialogue
  // ---------------------------------------------------------------

  /** A random line of the current character for a scenario, with placeholders filled in. */
  private _line(key: LineKey, vars: Parameters<typeof fillLine>[1] = {}): string {
    return fillLine(pickLine(this.currentCharacter().lines[key]), vars);
  }

  /** Make the companion say something: in every open view and on the desktop. */
  private _say(
    text: string,
    opts: { mood?: 'alert' | 'angry' | 'happy'; sticky?: boolean; goto?: string; tab?: string } = {}
  ): void {
    if (!text) return;
    this.postMessage({ type: 'say', text, ...opts });
    this._alertEmitter.fire({ text, sticky: opts.sticky, mood: opts.mood });
  }

  // ---------------------------------------------------------------
  // Water reminder
  // ---------------------------------------------------------------
  private _waterConfig(): { enabled: boolean; intervalMinutes: number } {
    const c = vscode.workspace.getConfiguration('unagi.water');
    const raw = Number(c.get<number>('intervalMinutes', 60));
    return {
      enabled: c.get<boolean>('enabled', true),
      intervalMinutes: Math.max(1, Math.min(480, Math.round(isNaN(raw) ? 60 : raw)))
    };
  }

  private _quoteConfig(): { enabled: boolean; online: boolean; intervalMinutes: number } {
    const c = vscode.workspace.getConfiguration('unagi.quotes');
    const raw = Number(c.get<number>('intervalMinutes', 45));
    return {
      enabled: c.get<boolean>('enabled', true),
      online: c.get<boolean>('online', true),
      intervalMinutes: Math.max(1, Math.min(480, Math.round(isNaN(raw) ? 45 : raw)))
    };
  }

  /** The companion speaks a random quote (from the web when allowed, else from a built-in list). */
  public sayQuote(): void {
    this._lastQuote = Date.now();
    this._say(formatQuote(this._quotes.next(this._quoteConfig().online)), { mood: 'happy' });
  }

  public resetQuoteTimer(): void {
    this._lastQuote = Date.now();
  }

  /** Restart the countdown (called when the water settings change). */
  public resetWaterTimer(): void {
    this._lastWater = Date.now();
  }

  private _remindWater(): void {
    const text = this._line('water');
    void vscode.window.showInformationMessage(`💧 UNAGI: ${text}`);
    this._say(text, { mood: 'alert', sticky: true, goto: 'water', tab: 'timer' });
  }

  private _handleTimerComplete(): void {
    const wasFocus = this._state.timer.mode === 'focus' || this._state.timer.mode === 'idle';
    let text: string;
    if (wasFocus) {
      this._state.timer.mode = 'break';
      this._state.timer.timeLeft = 5 * 60;
      this._state.timer.totalTime = 5 * 60;
      this._state.timer.isRunning = false;
      this._state.timer.round++;
      text = this._line('focusDone');
      vscode.window.showInformationMessage(`🍣 UNAGI: ${text}`);
    } else {
      this._state.timer.mode = 'idle';
      this._state.timer.timeLeft = 25 * 60;
      this._state.timer.totalTime = 25 * 60;
      this._state.timer.isRunning = false;
      text = this._line('breakDone');
      vscode.window.showInformationMessage(`⚡ UNAGI: ${text}`);
    }
    this.postMessage({ type: 'timerAlert', message: text });
    this._say(text, { mood: 'alert', sticky: true, goto: 'timer', tab: 'timer' });
    this._persistData();
  }

  private _checkTaskReminders(): void {
    const pendingHighTasks = this._state.sprints.flatMap(sp => sp.tasks).filter(
      t => t.priority === 'high' && t.status !== 'done'
    );
    if (pendingHighTasks.length > 0) {
      const n = pendingHighTasks.length;
      const msg = `⚡ UNAGI Reminder: You have ${n} high-priority task${n > 1 ? 's' : ''} pending!`;
      vscode.window.showInformationMessage(msg, 'Open UNAGI').then(selection => {
        if (selection === 'Open UNAGI') {
          this.focus();
        }
      });
      this.postMessage({ type: 'taskReminder', pendingCount: n });
      this._say(this._line('reminder', { n }), { mood: 'alert', sticky: true, goto: 'reminder', tab: 'sprint' });
    }

    // A one-off sprint about to end with work left: the companion gets properly cross.
    for (const sp of this._state.sprints) {
      if (sp.repeat === 'daily') continue;
      const pending = sp.tasks.filter(t => t.status !== 'done').length;
      const end = Date.parse(sp.endDate);
      const days = isNaN(end) ? null : Math.ceil((end - Date.now()) / 86400000);
      if (days !== null && days <= 1 && pending > 0) {
        this._say(this._line('ending', { when: days <= 0 ? 'today' : 'tomorrow', p: pending, sprint: sp.name }), { mood: 'angry', sticky: true, goto: 'sprint', tab: 'sprint' });
        break;
      }
    }
  }

  /** Announce what changed between two versions of the sprints. */
  private _announceTaskChanges(prev: SprintData[], next: SprintData[]): void {
    let completed: SprintData | undefined;
    let doneTask: SprintTask | undefined;
    let doneSprint: SprintData | undefined;
    let added: SprintTask | undefined;
    let addedSprint: SprintData | undefined;

    for (const sp of next) {
      const old = prev.find(o => o.id === sp.id);
      if (!old) continue;
      const before = new Map(old.tasks.map(t => [t.id, t.status]));
      const newlyDone = sp.tasks.filter(t => t.status === 'done' && before.has(t.id) && before.get(t.id) !== 'done');
      if (newlyDone.length) {
        doneTask = newlyDone[newlyDone.length - 1];
        doneSprint = sp;
        if (sp.tasks.every(t => t.status === 'done')) completed = sp;
      }
      const fresh = sp.tasks.filter(t => !before.has(t.id));
      if (fresh.length) { added = fresh[fresh.length - 1]; addedSprint = sp; }
    }

    const short = (t: string) => (t.length > 40 ? t.slice(0, 37) + '…' : t);
    if (completed) {
      this._say(this._line('sprintComplete', { sprint: completed.name }), { mood: 'happy' });
    } else if (doneTask && doneSprint) {
      this._say(this._line('taskDone', { t: short(doneTask.text), sprint: doneSprint.name }), { mood: 'happy' });
    } else if (added && addedSprint) {
      this._say(this._line('taskAdded', { t: short(added.text), sprint: addedSprint.name }));
    }
  }

  public focus(): void {
    vscode.commands.executeCommand(`${CompanionViewProvider.viewType}.focus`);
  }

  public toggleTimer(): void {
    if (this._state.timer.mode === 'idle') {
      this._state.timer.mode = 'focus';
      this._state.timer.timeLeft = 25 * 60;
      this._state.timer.totalTime = 25 * 60;
      this._state.timer.isRunning = true;
    } else {
      this._state.timer.isRunning = !this._state.timer.isRunning;
    }
    this._persistData();
    this._broadcastSync();
    this._updateStatusBar();
  }

  public resetTimer(): void {
    this._state.timer.mode = 'idle';
    this._state.timer.timeLeft = 25 * 60;
    this._state.timer.totalTime = 25 * 60;
    this._state.timer.isRunning = false;
    this._persistData();
    this._broadcastSync();
    this._updateStatusBar();
  }

  public addQuickTask(text: string, priority: 'high' | 'medium' | 'low' = 'medium'): void {
    const prev = JSON.parse(JSON.stringify(this._state.sprints)) as SprintData[];
    const target = this._activeSprint;
    target.tasks.push({ id: String(Date.now()), text, priority, status: 'todo', createdAt: Date.now() });
    this._announceTaskChanges(prev, this._state.sprints);
    this._persistData();
    this._broadcastSync();
    this._updateStatusBar();
  }

  private _updateStatusBar(): void {
    if (!this._statusBarItem) return;

    const m = Math.floor(this._state.timer.timeLeft / 60);
    const s = this._state.timer.timeLeft % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    const timerIcon = this._state.timer.isRunning ? '$(clock)' : '$(play)';

    const active = this._activeSprint;
    const total = active.tasks.length;
    const done = active.tasks.filter(t => t.status === 'done').length;

    this._statusBarItem.text = `⚡ UNAGI: ${timerIcon} ${timeStr} | $(checklist) ${done}/${total}`;
    this._statusBarItem.tooltip = `UNAGI: Total Awareness | ${done}/${total} tasks done in ${active.name}. Click to open.`;
    this._statusBarItem.show();
  }

  private _broadcastSync(): void {
    this.postMessage({
      type: 'sync',
      state: this._state
    });
  }

  /** Where characters made from photos are stored (set once at activation). */
  public setUserCharacterDir(dir: string): void {
    this._userDir = dir;
  }

  private _localRoots(): vscode.Uri[] {
    return this._userDir ? [this._extensionUri, vscode.Uri.file(this._userDir)] : [this._extensionUri];
  }

  public allCharacters(): CharacterDef[] {
    return loadCharacters(this._extensionUri.fsPath, this._userDir);
  }

  /** The character picked in settings (falls back to Croagunk if it no longer exists). */
  public currentCharacter(): CharacterDef {
    const c = this._baseCharacter();
    return { ...c, lines: mergeLines(c.lines, this._dialogue[c.id]) };
  }

  /** The character as shipped, before the user's own dialogue is applied. */
  private _baseCharacter(): CharacterDef {
    const id = vscode.workspace.getConfiguration('unagi.companion').get<string>('character', DEFAULT_CHARACTER);
    return getCharacter(this._extensionUri.fsPath, id, this._userDir);
  }

  private _dialogueData(): CompanionPanelData['dialogue'] {
    const base = this._baseCharacter();
    const custom = this._dialogue[base.id] ?? {};
    const lines = mergeLines(base.lines, custom);
    return {
      character: base.name,
      scenarios: SCENARIOS.map(sc => ({
        key: sc.key, label: sc.label, hint: sc.hint, vars: sc.vars,
        lines: lines[sc.key], custom: !!(custom[sc.key] && custom[sc.key]!.length)
      }))
    };
  }

  /** Save (or, with no lines, clear) the user's own dialogue for one scenario of the current character. */
  private async _setDialogue(key: unknown, lines: unknown): Promise<void> {
    if (typeof key !== 'string' || !SCENARIOS.some(sc => sc.key === key)) return;
    const id = this._baseCharacter().id;
    const clean = (Array.isArray(lines) ? lines : [])
      .map(l => String(l).replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 30);
    const mine = { ...(this._dialogue[id] ?? {}) };
    if (clean.length) mine[key as LineKey] = clean;
    else delete mine[key as LineKey];
    const next = { ...this._dialogue };
    if (Object.keys(mine).length) next[id] = mine; else delete next[id];
    this._dialogue = next;
    await this._globalState.update('unagi.dialogue', this._dialogue);
    this._dialogueEmitter.fire();
    this.broadcastCompanionConfig();
  }

  /** Have the companion say a scenario line now (sample values fill the placeholders). */
  private _previewDialogue(key: unknown, lines: unknown): void {
    if (typeof key !== 'string' || !SCENARIOS.some(sc => sc.key === key)) return;
    const list = (Array.isArray(lines) ? lines : []).map(l => String(l).trim()).filter(Boolean);
    const pool = list.length ? list : this.currentCharacter().lines[key as LineKey];
    const sample = { n: 2, t: 'Write the tests', when: 'tomorrow', p: 3, sprint: this._activeSprint.name };
    this._say(fillLine(pickLine(pool), sample), { mood: key === 'ending' ? 'angry' : key === 'pet' ? 'happy' : 'alert' });
  }

  private _movement(): 'free' | 'floor' {
    return vscode.workspace.getConfiguration('unagi.companion').get<string>('movement', 'free') === 'floor' ? 'floor' : 'free';
  }

  private _panelData(webview: vscode.Webview): CompanionPanelData {
    const url = (file: string) => webview.asWebviewUri(vscode.Uri.file(file)).toString();
    const desktopOn = vscode.workspace.getConfiguration('unagi.desktopCompanion').get<boolean>('enabled', false);
    return {
      current: this.currentCharacter().id,
      characters: this.allCharacters().map(c => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        custom: !!c.custom,
        thumb: c.kind === 'sprite' && c.anims.idle
          ? { url: url(c.anims.idle.file), w: c.anims.idle.w, h: c.anims.idle.h, frames: c.anims.idle.frames }
          : c.kind === 'photo' && c.image
            ? { url: url(c.image.file), w: c.image.w, h: c.image.h, frames: 1 }
            : undefined
      })),
      settings: {
        enabled: vscode.workspace.getConfiguration('unagi.companion').get<boolean>('enabled', true),
        movement: this._movement(),
        desktop: desktopOn && process.platform === 'win32',
        desktopSupported: process.platform === 'win32'
      },
      dialogue: this._dialogueData()
    };
  }

  /** Remove a custom character (asks for confirmation) and fall back to the default if it was in use. */
  public async deleteCharacter(id?: string): Promise<void> {
    if (!this._userDir) return;
    const deleted = await deleteCustomCharacter(this._userDir, this.allCharacters(), id);
    if (!deleted) return;
    const config = vscode.workspace.getConfiguration('unagi.companion');
    if (config.get<string>('character') === deleted) {
      await config.update('character', DEFAULT_CHARACTER, vscode.ConfigurationTarget.Global);
    } else {
      this.broadcastCompanionConfig();
    }
  }

  private _companionConfig(webview: vscode.Webview): { enabled: boolean; movement: 'free' | 'floor'; character: WebviewCharacter } {
    const config = vscode.workspace.getConfiguration('unagi.companion');
    // The desktop companion replaces the in-view one so there's only ever one companion on screen.
    const desktop = process.platform === 'win32' &&
      vscode.workspace.getConfiguration('unagi.desktopCompanion').get<boolean>('enabled', false);
    const c = this.currentCharacter();
    const anims: WebviewCharacter['anims'] = {};
    for (const [name, a] of Object.entries(c.anims)) {
      anims[name] = {
        url: webview.asWebviewUri(vscode.Uri.file(a.file)).toString(),
        frames: a.frames, w: a.w, h: a.h, frameMs: a.frameMs, loop: a.loop
      };
    }
    const image = c.image
      ? { url: webview.asWebviewUri(vscode.Uri.file(c.image.file)).toString(), w: c.image.w, h: c.image.h }
      : undefined;
    return {
      enabled: config.get<boolean>('enabled', true) && !desktop,
      movement: this._movement(),
      character: { id: c.id, name: c.name, kind: c.kind, facing: c.facing, height: c.height, anims, image, lines: c.lines }
    };
  }

  /** Push the current companion settings to every open webview. */
  public broadcastCompanionConfig(): void {
    for (const webview of this._webviews) {
      webview.postMessage({ type: 'config', config: this._companionConfig(webview) });
      webview.postMessage({ type: 'companionPanel', data: this._panelData(webview) });
      webview.postMessage({ type: 'water', ...this._waterConfig() });
    }
  }

  /** Quick pick of every available character; the choice applies to the in-view and desktop companions. */
  public async chooseCharacter(): Promise<void> {
    const current = this.currentCharacter().id;
    const CREATE = '__create__';
    const items = [
      ...this.allCharacters().map(c => ({
        label: c.name,
        description: c.id === current ? 'current' : undefined,
        detail: c.kind === 'vector' ? 'Built-in character'
          : c.custom ? 'Your custom character'
          : `Sprite character · ${Object.keys(c.anims).length} animations`,
        id: c.id
      })),
      { label: '$(add) Create a custom character from a photo…', description: undefined, detail: undefined, id: CREATE }
    ];
    const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Choose your UNAGI companion' });
    if (!pick) return;
    if (pick.id === CREATE) {
      await vscode.commands.executeCommand('unagi.createCharacter');
      return;
    }
    await vscode.workspace.getConfiguration('unagi.companion').update('character', pick.id, vscode.ConfigurationTarget.Global);
  }

  public async toggleCompanion(): Promise<void> {
    const config = vscode.workspace.getConfiguration('unagi.companion');
    const next = !config.get<boolean>('enabled', true);
    await config.update('enabled', next, vscode.ConfigurationTarget.Global);
  }

  /** Open UNAGI in an editor tab: a much larger area for the companion to roam. */
  public openInEditor(): void {
    if (this._panel) {
      this._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'unagi.panel',
      'UNAGI',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this._localRoots()
      }
    );
    this._panel = panel;
    panel.onDidDispose(() => {
      this._panel = undefined;
    });
    this._bindWebview(panel);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._bindWebview(webviewView);
  }

  private _bindWebview(host: WebviewHost): void {
    const webview = host.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: this._localRoots()
    };

    webview.html = this._getHtmlForWebview(webview);
    this._webviews.add(webview);

    host.onDidDispose(() => {
      this._webviews.delete(webview);
    });

    webview.onDidReceiveMessage(async (message: any) => {
      switch (message.command) {
        // ---- Companion tab controls ----
        case 'selectCharacter':
          if (typeof message.id === 'string' && this.allCharacters().some(c => c.id === message.id)) {
            await vscode.workspace.getConfiguration('unagi.companion').update('character', message.id, vscode.ConfigurationTarget.Global);
          }
          break;

        case 'createCharacter':
          void vscode.commands.executeCommand('unagi.createCharacter');
          break;

        case 'deleteCharacter':
          if (typeof message.id === 'string') await this.deleteCharacter(message.id);
          break;

        case 'setMovement':
          if (message.value === 'free' || message.value === 'floor') {
            await vscode.workspace.getConfiguration('unagi.companion').update('movement', message.value, vscode.ConfigurationTarget.Global);
          }
          break;

        case 'setCompanionEnabled':
          await vscode.workspace.getConfiguration('unagi.companion').update('enabled', !!message.value, vscode.ConfigurationTarget.Global);
          break;

        case 'setDesktopCompanion':
          if (process.platform === 'win32') {
            await vscode.workspace.getConfiguration('unagi.desktopCompanion').update('enabled', !!message.value, vscode.ConfigurationTarget.Global);
          }
          break;

        case 'saveDialogue':
          await this._setDialogue(message.key, message.lines);
          break;

        case 'resetDialogue':
          await this._setDialogue(message.key, []);
          break;

        case 'testDialogue':
          this._previewDialogue(message.key, message.lines);
          break;

        case 'setWater': {
          const water = vscode.workspace.getConfiguration('unagi.water');
          if (typeof message.enabled === 'boolean') await water.update('enabled', message.enabled, vscode.ConfigurationTarget.Global);
          if (typeof message.intervalMinutes === 'number' && isFinite(message.intervalMinutes)) {
            await water.update('intervalMinutes', Math.max(1, Math.min(480, Math.round(message.intervalMinutes))), vscode.ConfigurationTarget.Global);
          }
          break;
        }

        case 'ready':
          webview.postMessage({ type: 'config', config: this._companionConfig(webview) });
          webview.postMessage({ type: 'companionPanel', data: this._panelData(webview) });
          webview.postMessage({ type: 'water', ...this._waterConfig() });
          webview.postMessage({ type: 'sync', state: this._state });
          break;

        case 'updateSprints':
          if (Array.isArray(message.sprints)) {
            const prev = this._state.sprints;
            const next = this._sanitizeSprints(message.sprints, prev);
            this._announceTaskChanges(prev, next);
            this._state.sprints = next;
            this._state.activeSprintId = next.some(sp => sp.id === message.activeSprintId) ? message.activeSprintId : next[0].id;
            await this._persistData();
            this._broadcastSync();
            this._updateStatusBar();
          }
          break;

        case 'updateNotes':
          if (typeof message.notes === 'string') {
            this._state.notes = message.notes;
            await this._persistData();
          }
          break;

        case 'toggleTimer':
          this.toggleTimer();
          break;

        case 'resetTimer':
          this.resetTimer();
          break;

        case 'setTimerPreset':
          if (message.minutes) {
            this._state.timer.timeLeft = message.minutes * 60;
            this._state.timer.totalTime = message.minutes * 60;
            this._state.timer.mode = message.mode || 'focus';
            this._state.timer.isRunning = false;
            await this._persistData();
            this._broadcastSync();
            this._updateStatusBar();
          }
          break;
      }
    });
  }

  public postMessage(message: DeskMessageType): void {
    for (const webview of this._webviews) {
      webview.postMessage(message);
    }
  }

  public dispose(): void {
    if (this._tickerInterval) {
      clearInterval(this._tickerInterval);
    }
    this._alertEmitter.dispose();
  }

  private _getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );
    const petScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'pet.js')
    );
    const companionScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'companion.js')
    );
    const petStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'pet.css')
    );
    const nonce = this._getNonce();

    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet" />
  <link href="${petStyleUri}" rel="stylesheet" />
  <title>UNAGI</title>
</head>
<body>
  <div id="appContainer">
    <!-- Top UNAGI Brand & Live Clock Header -->
    <header id="clockHeader">
      <div class="brand-clock-col">
        <div class="unagi-brand-row">
          <span class="unagi-symbol">⚡</span>
          <span class="unagi-brand-text">UNAGI</span>
          <span class="unagi-subtag">TOTAL AWARENESS</span>
        </div>
        <div id="liveDate" class="live-date">Loading date...</div>
      </div>
      <div class="header-right">
        <div id="liveTime" class="live-time">--:--:--</div>
        <div class="timer-pill" id="headerTimerPill" title="Click to view Focus Timer">
          <span class="timer-icon">⏱️</span>
          <span id="headerTimerText">25:00</span>
        </div>
      </div>
    </header>

    <!-- Navigation Tabs -->
    <nav id="navTabs">
      <button class="nav-tab active" data-tab="sprint" title="Sprints & Tasks"><span class="ico">🏃</span><span class="lbl">Sprints & Tasks</span></button>
      <button class="nav-tab" data-tab="notes" title="Notes"><span class="ico">📝</span><span class="lbl">Notes</span></button>
      <button class="nav-tab" data-tab="timer" title="Focus Clock"><span class="ico">⏱️</span><span class="lbl">Focus Clock</span></button>
      <button class="nav-tab" data-tab="companion" title="Companion"><span class="ico">🐸</span><span class="lbl">Companion</span></button>
    </nav>

    <!-- Content Panels -->
    <main id="tabPanels">
      <!-- 1. SPRINTS & TASKS PANEL -->
      <section id="sprintPanel" class="tab-panel active">
        <!-- Sprint switcher: one tab per sprint (personal / work, one-off / daily) -->
        <div class="sprint-switcher">
          <div id="sprintTabs" class="sprint-tabs" role="tablist" aria-label="Sprints"></div>
          <button id="newSprintBtn" class="btn secondary small" title="Create a new sprint">＋ Sprint</button>
        </div>

        <div id="newSprintForm" class="card new-sprint hidden">
          <input type="text" id="newSprintName" placeholder="Sprint name (e.g. Morning routine)" maxlength="60" />
          <div class="input-row">
            <select id="newSprintType" class="priority-select" title="Sprint type">
              <option value="personal">🏡 Personal tasks</option>
              <option value="work">💼 Work tasks</option>
            </select>
            <select id="newSprintRepeat" class="priority-select" title="Repeat">
              <option value="daily">🔁 Repeats daily</option>
              <option value="none">One-off (7 days)</option>
            </select>
          </div>
          <div class="input-row">
            <button id="createSprintBtn" class="btn primary small">Create sprint</button>
            <button id="cancelSprintBtn" class="btn secondary small">Cancel</button>
          </div>
        </div>

        <!-- Sprint Info Card -->
        <div class="card sprint-header-card">
          <div class="sprint-title-row">
            <h3 id="sprintTitle" class="sprint-title">Sprint</h3>
            <span id="sprintBadge" class="badge">Work</span>
          </div>
          <div class="sprint-dates" id="sprintDates">Active Sprint Duration</div>
          <div class="sprint-tools">
            <button id="sprintRepeatBtn" class="chip" title="Daily sprints start over every day">🔁 Daily</button>
            <button id="sprintRenameBtn" class="chip" title="Rename this sprint">✎ Rename</button>
            <button id="sprintDeleteBtn" class="chip danger" title="Delete this sprint">🗑 Delete</button>
          </div>

          <div class="progress-container">
            <div class="progress-bar">
              <div id="sprintProgressFill" class="progress-fill" style="width: 0%;"></div>
            </div>
            <span id="sprintPercentText" class="progress-label">0% Complete (0/0)</span>
          </div>
        </div>

        <!-- Task Reminder Alert Banner (Shown if High-priority pending) -->
        <div id="reminderBanner" class="reminder-banner hidden">
          <span class="reminder-icon">⚠️</span>
          <span id="reminderText" class="reminder-text">2 high-priority tasks pending in this sprint</span>
        </div>

        <!-- Add Task Input Row -->
        <div class="card add-task-card">
          <div class="input-row">
            <input type="text" id="taskInput" placeholder="Add sprint task (Press Enter)..." />
            <select id="taskPrioritySelect" class="priority-select" title="Task Priority">
              <option value="high">🔴 High</option>
              <option value="medium" selected>🟡 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
            <button id="addTaskBtn" class="btn primary small">+ Add</button>
          </div>
        </div>

        <!-- Task Filter Chips -->
        <div class="filter-bar">
          <button class="filter-chip active" data-filter="all">All (<span id="filterAllCount">0</span>)</button>
          <button class="filter-chip" data-filter="pending">Pending (<span id="filterPendingCount">0</span>)</button>
          <button class="filter-chip" data-filter="done">Completed (<span id="filterDoneCount">0</span>)</button>
        </div>

        <!-- Tasks List -->
        <ul id="tasksList" class="tasks-list">
          <!-- Dynamically populated sprint tasks -->
        </ul>
      </section>

      <!-- 2. NOTES & SCRATCHPAD PANEL -->
      <section id="notesPanel" class="tab-panel">
        <div class="card notes-card">
          <div class="notes-toolbar">
            <div class="format-buttons">
              <button class="fmt-btn" data-fmt="todo" title="Insert Checkbox Task">[ ] Task</button>
              <button class="fmt-btn" data-fmt="bullet" title="Insert Bullet">• Bullet</button>
              <button class="fmt-btn" data-fmt="code" title="Insert Code Block">Code</button>
              <button class="fmt-btn" data-fmt="h2" title="Insert Heading">## Heading</button>
            </div>
            <div class="notes-actions">
              <button id="copyNotesBtn" class="btn secondary small" title="Copy Notes to Clipboard">📋 Copy</button>
              <button id="clearNotesBtn" class="btn secondary small" title="Clear Scratchpad">✕ Clear</button>
            </div>
          </div>
          
          <textarea id="notesArea" class="notes-textarea" placeholder="Type quick notes, ideas, code snippets, or sprint logs here... (Auto-saves automatically)"></textarea>

          <div class="notes-footer">
            <span id="notesCount" class="notes-count">0 words | 0 characters</span>
            <span id="notesStatus" class="notes-status">Saved</span>
          </div>
        </div>
      </section>

      <!-- 3. FOCUS CLOCK & TIMER PANEL -->
      <section id="timerPanel" class="tab-panel">
        <div class="card timer-card">
          <div class="timer-mode-badge" id="timerModeBadge">UNAGI FOCUS SESSION</div>

          <div class="timer-display">
            <h1 id="timerClock" class="timer-clock">25:00</h1>
            <p id="timerSubtext" class="timer-subtext">Total Awareness & Deep Flow</p>
          </div>

          <div class="timer-controls">
            <button id="timerToggleBtn" class="btn primary large glow">Start Focus</button>
            <button id="timerResetBtn" class="btn secondary large">Reset</button>
          </div>

          <div class="preset-section">
            <span class="preset-label">Quick Presets:</span>
            <div class="preset-chips">
              <button class="chip active" data-mins="25" data-mode="focus">⚡ 25m Unagi Focus</button>
              <button class="chip" data-mins="50" data-mode="focus">🧠 50m Deep Flow</button>
              <button class="chip" data-mins="15" data-mode="focus">🏃 15m Sprint</button>
              <button class="chip" data-mins="5" data-mode="break">☕ 5m Break</button>
            </div>
          </div>
        </div>

        <!-- Water reminder: the companion nudges you to drink on a schedule you choose -->
        <div class="card water-card" id="waterCard">
          <div class="comp-head">
            <h3 class="comp-title">💧 Drink water reminder</h3>
            <label class="switch" title="Turn the water reminder on or off">
              <input type="checkbox" id="waterEnabled" />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-label">On</span>
            </label>
          </div>
          <div class="water-row">
            <label for="waterInterval">Remind me every</label>
            <input type="number" id="waterInterval" min="1" max="480" step="1" value="60" />
            <span>min</span>
          </div>
          <div class="preset-chips water-presets">
            <button class="chip" data-water="30">30m</button>
            <button class="chip" data-water="45">45m</button>
            <button class="chip" data-water="60">1h</button>
            <button class="chip" data-water="90">1.5h</button>
            <button class="chip" data-water="120">2h</button>
          </div>
          <p id="waterHint" class="comp-hint"></p>
        </div>
      </section>

      <!-- 4. COMPANION PANEL: choose a character, how it moves -->
      <section id="companionPanel" class="tab-panel">
        <div class="card">
          <div class="comp-head">
            <h3 class="comp-title">Choose your companion</h3>
            <label class="switch" title="Show or hide the companion">
              <input type="checkbox" id="compEnabled" />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-label">Show</span>
            </label>
          </div>
          <div id="charGrid" class="char-grid" role="radiogroup" aria-label="Companion character"></div>
          <button id="createCharBtn" class="btn secondary small comp-create">＋ Create one from a photo</button>
        </div>

        <div class="card">
          <h3 class="comp-title">Movement</h3>
          <div id="moveSeg" class="seg" role="radiogroup" aria-label="Movement style">
            <button type="button" role="radio" data-move="floor"><span class="seg-ico">🚶</span><span>Walk on floor</span></button>
            <button type="button" role="radio" data-move="free"><span class="seg-ico">🧭</span><span>Roam everywhere</span></button>
          </div>
          <p id="moveHint" class="comp-hint"></p>
        </div>

        <div class="card" id="desktopCard">
          <div class="comp-head">
            <h3 class="comp-title">Desktop companion</h3>
            <label class="switch" title="Let the companion roam your whole screen">
              <input type="checkbox" id="compDesktop" />
              <span class="switch-track" aria-hidden="true"></span>
              <span class="switch-label">On</span>
            </label>
          </div>
          <p id="desktopHint" class="comp-hint">Lets your companion leave the sidebar and roam your whole screen, on top of any app.</p>
        </div>

        <div class="card" id="dialogueCard">
          <h3 class="comp-title">Dialogue <span id="dlgChar" class="dlg-char"></span></h3>
          <p class="comp-hint">Choose what your companion says in each situation. Add several lines (one per row) and it picks one at random.</p>
          <select id="dlgScenario" class="priority-select dlg-select" aria-label="Scenario"></select>
          <p id="dlgHint" class="comp-hint"></p>
          <textarea id="dlgText" class="dlg-text" rows="5" spellcheck="true" aria-label="Lines the companion says"></textarea>
          <p id="dlgVars" class="comp-hint"></p>
          <div class="dlg-actions">
            <button id="dlgSave" class="btn primary small">Save</button>
            <button id="dlgTest" class="btn secondary small" title="Hear it from your companion now">▶ Preview</button>
            <button id="dlgReset" class="btn secondary small" title="Go back to the default lines">Reset</button>
          </div>
        </div>
      </section>
    </main>
  </div>

  <script nonce="${nonce}" src="${petScriptUri}"></script>
  <script nonce="${nonce}" src="${companionScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
