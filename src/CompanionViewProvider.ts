import * as vscode from 'vscode';
import * as crypto from 'crypto';
import type { CompanionAlert } from './DesktopCompanion';
import { CharacterDef, DEFAULT_CHARACTER, fillLine, getCharacter, loadCharacters, pickLine } from './characters';
import { deleteCustomCharacter } from './CharacterStudio';

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

export interface SprintData {
  name: string;
  startDate: string;
  endDate: string;
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
  sprint: SprintData;
  notes: string;
  timer: TimerState;
}

export type DeskMessageType =
  | { type: 'sync'; state: DeskState }
  | { type: 'timerAlert'; message: string }
  | { type: 'taskReminder'; pendingCount: number }
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
}

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
  private _statusBarItem?: vscode.StatusBarItem;
  private _tickerInterval?: NodeJS.Timeout;
  private _lastReminderCheck = Date.now();

  private _state: DeskState = {
    sprint: {
      name: 'Sprint 14: Core Features',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      tasks: [
        { id: '1', text: 'Implement user authentication & session management', priority: 'high', status: 'done', createdAt: Date.now() - 3600000 },
        { id: '2', text: 'Connect database migrations and schema indexes', priority: 'high', status: 'inprogress', createdAt: Date.now() - 2400000 },
        { id: '3', text: 'Write end-to-end integration tests for API endpoints', priority: 'medium', status: 'todo', createdAt: Date.now() - 1200000 },
        { id: '4', text: 'Review pull requests and update technical docs', priority: 'low', status: 'todo', createdAt: Date.now() }
      ]
    },
    notes: `# UNAGI: Total Awareness ⚡🍣\n\n"Unagi is a state of total awareness. Only by achieving true Unagi can you be prepared for any danger that may befall you."\n\n## Quick Sprint Notes:\n- [ ] Check API rate limits before deploy\n- [ ] Verify database connection pool sizing\n\n\`\`\`ts\n// Unagi flow\nconst state = "Total Awareness";\n\`\`\`\n`,
    timer: {
      isRunning: false,
      timeLeft: 25 * 60,
      totalTime: 25 * 60,
      mode: 'idle',
      round: 1
    }
  };

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _globalState: vscode.Memento
  ) {
    this._loadPersistedData();
    this._startBackgroundTicker();
  }

  public setStatusBarItem(statusBarItem: vscode.StatusBarItem): void {
    this._statusBarItem = statusBarItem;
    this._updateStatusBar();
  }

  private _loadPersistedData(): void {
    const sSprint = this._globalState.get<SprintData>('unagi.sprint') || this._globalState.get<SprintData>('sprintdesk.sprint');
    if (sSprint) this._state.sprint = sSprint;

    const sNotes = this._globalState.get<string>('unagi.notes') || this._globalState.get<string>('sprintdesk.notes');
    if (typeof sNotes === 'string') this._state.notes = sNotes;

    const sTimer = this._globalState.get<TimerState>('unagi.timer') || this._globalState.get<TimerState>('sprintdesk.timer');
    if (sTimer) this._state.timer = sTimer;
  }

  private async _persistData(): Promise<void> {
    await this._globalState.update('unagi.sprint', this._state.sprint);
    await this._globalState.update('unagi.notes', this._state.notes);
    await this._globalState.update('unagi.timer', this._state.timer);
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

      // 2. Periodic task reminder check (every configured interval)
      const config = vscode.workspace.getConfiguration('unagi');
      const reminderMins = config.get<number>('reminderIntervalMinutes', 30);
      const enableReminders = config.get<boolean>('enableTaskReminders', true);

      if (enableReminders && (Date.now() - this._lastReminderCheck) >= reminderMins * 60000) {
        this._lastReminderCheck = Date.now();
        this._checkTaskReminders();
      }

      this._updateStatusBar();

      if (needsSync) {
        this._broadcastSync();
      }
    }, 1000);
  }

  private _handleTimerComplete(): void {
    const wasFocus = this._state.timer.mode === 'focus' || this._state.timer.mode === 'idle';
    if (wasFocus) {
      this._state.timer.mode = 'break';
      this._state.timer.timeLeft = 5 * 60;
      this._state.timer.totalTime = 5 * 60;
      this._state.timer.isRunning = false;
      this._state.timer.round++;

      const msg = '🍣 UNAGI: Focus session complete! Take a refreshing 5-minute break.';
      vscode.window.showInformationMessage(msg);
      this.postMessage({ type: 'timerAlert', message: msg });
      this._alertEmitter.fire({ text: msg, sticky: true, mood: 'alert' });
    } else {
      this._state.timer.mode = 'idle';
      this._state.timer.timeLeft = 25 * 60;
      this._state.timer.totalTime = 25 * 60;
      this._state.timer.isRunning = false;

      const msg = '⚡ UNAGI: Break finished! Ready to enter total awareness again?';
      vscode.window.showInformationMessage(msg);
      this.postMessage({ type: 'timerAlert', message: msg });
      this._alertEmitter.fire({ text: msg, sticky: true, mood: 'alert' });
    }
    this._persistData();
  }

  private _checkTaskReminders(): void {
    const pendingHighTasks = this._state.sprint.tasks.filter(
      t => t.priority === 'high' && t.status !== 'done'
    );
    if (pendingHighTasks.length > 0) {
      const msg = `⚡ UNAGI Reminder: You have ${pendingHighTasks.length} high-priority task${pendingHighTasks.length > 1 ? 's' : ''} pending!`;
      vscode.window.showInformationMessage(msg, 'Open UNAGI').then(selection => {
        if (selection === 'Open UNAGI') {
          this.focus();
        }
      });
      this.postMessage({ type: 'taskReminder', pendingCount: pendingHighTasks.length });
      const lines = this.currentCharacter().lines;
      this._alertEmitter.fire({
        text: fillLine(lines.reminder, { n: pendingHighTasks.length }),
        sticky: true,
        mood: 'alert'
      });

      // Sprint about to end with work left: the companion gets properly cross.
      const pending = this._state.sprint.tasks.filter(t => t.status !== 'done').length;
      const end = Date.parse(this._state.sprint.endDate);
      const days = isNaN(end) ? null : Math.ceil((end - Date.now()) / 86400000);
      if (days !== null && days <= 1 && pending > 0) {
        this._alertEmitter.fire({
          text: fillLine(lines.ending, { when: days <= 0 ? 'today' : 'tomorrow', p: pending }),
          sticky: true,
          mood: 'angry'
        });
      }
    }
  }

  /** Announce what changed between two versions of the task list. */
  private _announceTaskChanges(prev: SprintTask[], next: SprintTask[]): void {
    const before = new Map(prev.map(t => [t.id, t.status]));
    const newlyDone = next.filter(t => t.status === 'done' && before.has(t.id) && before.get(t.id) !== 'done');
    const added = next.filter(t => !before.has(t.id));

    const lines = this.currentCharacter().lines;
    if (newlyDone.length) {
      const allDone = next.length > 0 && next.every(t => t.status === 'done');
      this._alertEmitter.fire({
        text: pickLine(allDone ? lines.allDone : lines.taskDone),
        mood: 'happy'
      });
    } else if (added.length) {
      const text = added[added.length - 1].text;
      this._alertEmitter.fire({ text: fillLine(lines.taskAdded, { t: text.length > 40 ? text.slice(0, 37) + '…' : text }) });
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
    this._announceTaskChanges(this._state.sprint.tasks, [
      ...this._state.sprint.tasks,
      { id: '', text, priority, status: 'todo', createdAt: Date.now() }
    ]);
    this._state.sprint.tasks.push({
      id: String(Date.now()),
      text,
      priority,
      status: 'todo',
      createdAt: Date.now()
    });
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

    const total = this._state.sprint.tasks.length;
    const done = this._state.sprint.tasks.filter(t => t.status === 'done').length;

    this._statusBarItem.text = `⚡ UNAGI: ${timerIcon} ${timeStr} | $(checklist) ${done}/${total}`;
    this._statusBarItem.tooltip = `UNAGI: Total Awareness | ${done}/${total} sprint tasks done. Click to open.`;
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
    const id = vscode.workspace.getConfiguration('unagi.companion').get<string>('character', DEFAULT_CHARACTER);
    return getCharacter(this._extensionUri.fsPath, id, this._userDir);
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
      }
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

        case 'ready':
          webview.postMessage({ type: 'config', config: this._companionConfig(webview) });
          webview.postMessage({ type: 'companionPanel', data: this._panelData(webview) });
          webview.postMessage({ type: 'sync', state: this._state });
          break;

        case 'updateSprint':
          if (message.sprint) {
            this._announceTaskChanges(this._state.sprint.tasks, message.sprint.tasks ?? []);
            this._state.sprint = message.sprint;
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
        <!-- Sprint Info Card -->
        <div class="card sprint-header-card">
          <div class="sprint-title-row">
            <h3 id="sprintTitle" class="sprint-title">Sprint 14: Core Features</h3>
            <span id="sprintBadge" class="badge">Active Sprint</span>
          </div>
          <div class="sprint-dates" id="sprintDates">Active Sprint Duration</div>
          
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
