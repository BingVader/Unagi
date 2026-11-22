import * as vscode from 'vscode';
import * as crypto from 'crypto';

export interface SprintTask {
  id: string;
  text: string;
  priority: 'high' | 'medium' | 'low';
  status: 'todo' | 'inprogress' | 'done';
}

export interface SprintData {
  name: string;
  startDate: string;
  endDate: string;
  tasks: SprintTask[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'sprint' | 'deadline' | 'meeting' | 'milestone';
}

export interface HabitItem {
  id: string;
  name: string;
  icon: string;
  streak: number;
  completedDays: number[]; // 0-6 (Sun-Sat)
}

export interface HydrationData {
  glassesToday: number;
  goal: number;
  lastDrinkTime: number;
}

export interface PomodoroState {
  mode: 'idle' | 'work' | 'break' | 'done';
  timeLeft: number;
  totalTime: number;
  isRunning: boolean;
  round: number;
  targetRounds: number;
  presetIndex: number;
}

export interface CompanionConfig {
  scale: number;
  reactToErrors: boolean;
  inactivityTimeoutSeconds: number;
  character: string;
  accessory: string | null;
  styleMode: string; // 'pixel' | 'hd'
  pomodoroFocusMinutes: number;
  pomodoroBreakMinutes: number;
  waterIntervalMinutes: number;
  waterDailyGoal: number;
  customPicture: string;
}

export type CompanionMessageType =
  | { type: 'config'; config: CompanionConfig }
  | {
      type: 'productivitySync';
      sprintData: SprintData;
      calendarEvents: CalendarEvent[];
      habits: HabitItem[];
      hydrationData: HydrationData;
      pomodoroState: PomodoroState;
      pokemonData?: PokemonData;
    }
  | { type: 'typing'; intensity: number }
  | { type: 'celebrate' }
  | { type: 'toggleSleep' }
  | { type: 'diagnostics'; hasErrors: boolean; errorCount: number }
  | { type: 'taskResult'; exitCode: number | undefined }
  | { type: 'waterAlert' }
  | { type: 'pomodoroAlert'; message: string };

export interface PokemonData {
  character: string;
  level: number;
  xp: number;
  xpNeeded: number;
}

export class CompanionViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'companion.view';

  private _webviews = new Set<vscode.Webview>();
  private _activeWebviewView?: vscode.WebviewView;
  private _fullPagePanel?: vscode.WebviewPanel;
  private _statusBarItem?: vscode.StatusBarItem;

  private _pokemonData: PokemonData = {
    character: 'pikachu',
    level: 1,
    xp: 25,
    xpNeeded: 100
  };

  private _config: CompanionConfig = {
    scale: 2,
    reactToErrors: true,
    inactivityTimeoutSeconds: 60,
    character: 'pikachu',
    accessory: null,
    styleMode: 'pixel',
    pomodoroFocusMinutes: 25,
    pomodoroBreakMinutes: 5,
    waterIntervalMinutes: 45,
    waterDailyGoal: 8,
    customPicture: ''
  };

  private _sprintData: SprintData = {
    name: 'Sprint 14: Core Engine & Refactor',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
    tasks: [
      { id: '1', text: 'Implement Pomodoro timer with rounds', priority: 'high', status: 'done' },
      { id: '2', text: 'Interactive 6-week Calendar grid & deadlines', priority: 'high', status: 'inprogress' },
      { id: '3', text: 'Drink water reminders & habit tracking', priority: 'medium', status: 'done' },
      { id: '4', text: 'Animated SVG characters (Mohanlal, CJ, Dog, Tom)', priority: 'medium', status: 'done' }
    ]
  };

  private _calendarEvents: CalendarEvent[] = [
    { id: '1', title: 'Sprint Kickoff & Planning', date: new Date().toISOString().split('T')[0], type: 'sprint' },
    { id: '2', title: 'Mid-Sprint Review', date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0], type: 'meeting' },
    { id: '3', title: 'v2.0 Release Milestone', date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], type: 'deadline' }
  ];

  private _habits: HabitItem[] = [
    { id: '1', name: 'Drink 8 Glasses of Water', icon: '💧', streak: 5, completedDays: [1, 2, 3, 4] },
    { id: '2', name: 'Focus Deep Work Session', icon: '💻', streak: 7, completedDays: [1, 2, 3, 4, 5] },
    { id: '3', name: 'Stretch & Posture Break', icon: '🧘', streak: 3, completedDays: [1, 2, 4] },
    { id: '4', name: 'Read Documentation', icon: '📚', streak: 4, completedDays: [2, 3, 4] }
  ];

  private _hydrationData: HydrationData = {
    glassesToday: 3,
    goal: 8,
    lastDrinkTime: Date.now()
  };

  private _pomodoroState: PomodoroState = {
    mode: 'idle',
    timeLeft: 25 * 60,
    totalTime: 25 * 60,
    isRunning: false,
    round: 1,
    targetRounds: 4,
    presetIndex: 0
  };

  private _lastDiagnosticsState = {
    hasErrors: false,
    errorCount: 0
  };

  private _timerInterval?: NodeJS.Timeout;

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
    const sSprint = this._globalState.get<SprintData>('companion.sprintData');
    if (sSprint) this._sprintData = sSprint;

    const sEvents = this._globalState.get<CalendarEvent[]>('companion.calendarEvents');
    if (sEvents) this._calendarEvents = sEvents;

    const sHabits = this._globalState.get<HabitItem[]>('companion.habits');
    if (sHabits) this._habits = sHabits;

    const sHydration = this._globalState.get<HydrationData>('companion.hydrationData');
    if (sHydration) this._hydrationData = sHydration;

    const sPokemon = this._globalState.get<PokemonData>('companion.pokemonData');
    if (sPokemon) this._pokemonData = sPokemon;

    const sPomo = this._globalState.get<PomodoroState>('companion.pomodoroState');
    if (sPomo) this._pomodoroState = sPomo;
  }

  private async _persistData(): Promise<void> {
    await this._globalState.update('companion.pokemonData', this._pokemonData);
    await this._globalState.update('companion.sprintData', this._sprintData);
    await this._globalState.update('companion.calendarEvents', this._calendarEvents);
    await this._globalState.update('companion.habits', this._habits);
    await this._globalState.update('companion.hydrationData', this._hydrationData);
    await this._globalState.update('companion.pomodoroState', this._pomodoroState);
  }

  private _startBackgroundTicker(): void {
    if (this._timerInterval) clearInterval(this._timerInterval);

    this._timerInterval = setInterval(() => {
      let needsSync = false;

      // 1. Pomodoro countdown
      if (this._pomodoroState.isRunning) {
        this._pomodoroState.timeLeft--;
        needsSync = true;

        if (this._pomodoroState.timeLeft <= 0) {
          this._handlePomodoroPhaseComplete();
        }
      }

      // 2. Hydration reminder countdown check
      const elapsedMins = (Date.now() - this._hydrationData.lastDrinkTime) / 60000;
      if (elapsedMins >= this._config.waterIntervalMinutes) {
        this._triggerWaterReminder();
      }

      this._updateStatusBar();

      if (needsSync) {
        this._broadcastProductivitySync();
      }
    }, 1000);
  }

  private _handlePomodoroPhaseComplete(): void {
    const isWork = this._pomodoroState.mode === 'work';
    if (isWork) {
      if (this._pomodoroState.round >= this._pomodoroState.targetRounds) {
        // Complete full cycle
        this._pomodoroState.mode = 'done';
        this._pomodoroState.isRunning = false;
        this._pomodoroState.timeLeft = 0;
        this._notifyPomodoroDone();
      } else {
        // Break
        this._pomodoroState.mode = 'break';
        this._pomodoroState.timeLeft = 5 * 60;
        this._pomodoroState.totalTime = 5 * 60;
        this._notifyPomodoroBreak();
      }
    } else {
      // Break finished -> next work session
      this._pomodoroState.round++;
      this._pomodoroState.mode = 'work';
      this._pomodoroState.timeLeft = 25 * 60;
      this._pomodoroState.totalTime = 25 * 60;
      this._notifyPomodoroWork();
    }
  }

  private _notifyPomodoroWork(): void {
    const text = `🍅 Focus round #${this._pomodoroState.round} started! I'll sit quietly beside you.`;
    this.postMessage({ type: 'pomodoroAlert', message: text });
    vscode.window.showInformationMessage(text);
  }

  private _notifyPomodoroBreak(): void {
    const text = '☕ Break time! Time to stretch together and rest your eyes 🙆';
    this.postMessage({ type: 'pomodoroAlert', message: text });
    this.postMessage({ type: 'celebrate' });
    vscode.window.showInformationMessage(text, 'Start Focus', 'Snooze 5m').then(sel => {
      if (sel === 'Start Focus') {
        this._pomodoroState.mode = 'work';
        this._pomodoroState.timeLeft = 25 * 60;
        this._broadcastProductivitySync();
      }
    });
  }

  private _notifyPomodoroDone(): void {
    const text = '🏆 Awesome session! You crushed all focus rounds! Keep up the momentum!';
    this.postMessage({ type: 'pomodoroAlert', message: text });
    this.postMessage({ type: 'celebrate' });
    vscode.window.showInformationMessage(text);
  }

  private _lastWaterPromptTime = 0;
  private _triggerWaterReminder(): void {
    if (Date.now() - this._lastWaterPromptTime < 10 * 60000) return;
    this._lastWaterPromptTime = Date.now();

    this.postMessage({ type: 'waterAlert' });

    vscode.window.showInformationMessage(
      `💧 Drink Water Reminder: Stay hydrated! (${this._hydrationData.glassesToday}/${this._hydrationData.goal} glasses today)`,
      'Logged (+1 Glass)',
      'Snooze 15m'
    ).then(sel => {
      if (sel === 'Logged (+1 Glass)') {
        this.logWater();
      }
    });
  }

  public logWater(): void {
    this._hydrationData.glassesToday++;
    this._hydrationData.lastDrinkTime = Date.now();
    this._persistData();
    this._broadcastProductivitySync();
    this.triggerCelebrate();
    vscode.window.showInformationMessage(`💧 Glass logged! (${this._hydrationData.glassesToday}/${this._hydrationData.goal} today)`);
  }

  public togglePomodoro(): void {
    if (this._pomodoroState.mode === 'idle' || this._pomodoroState.mode === 'done') {
      this._pomodoroState.mode = 'work';
      this._pomodoroState.timeLeft = 25 * 60;
      this._pomodoroState.totalTime = 25 * 60;
      this._pomodoroState.isRunning = true;
    } else {
      this._pomodoroState.isRunning = !this._pomodoroState.isRunning;
    }
    this._persistData();
    this._broadcastProductivitySync();
    this._updateStatusBar();
  }

  public resetPomodoro(): void {
    this._pomodoroState.mode = 'idle';
    this._pomodoroState.timeLeft = 25 * 60;
    this._pomodoroState.totalTime = 25 * 60;
    this._pomodoroState.isRunning = false;
    this._pomodoroState.round = 1;
    this._persistData();
    this._broadcastProductivitySync();
    this._updateStatusBar();
  }

  private _updateStatusBar(): void {
    if (!this._statusBarItem) return;

    const m = Math.floor(this._pomodoroState.timeLeft / 60);
    const s = this._pomodoroState.timeLeft % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    const modeLabel = this._pomodoroState.mode === 'work' ? 'Focus' : (this._pomodoroState.mode === 'break' ? 'Break' : 'Idle');
    const runningIcon = this._pomodoroState.isRunning ? '$(clock)' : '$(play)';

    this._statusBarItem.text = `${runningIcon} ${timeStr} [${modeLabel}] | $(beaker) ${this._hydrationData.glassesToday}/${this._hydrationData.goal}`;
    this._statusBarItem.tooltip = `Pomodoro & Hydration Tracker - Click to open Desktop Buddy`;
    this._statusBarItem.show();
  }

  private _broadcastProductivitySync(): void {
    this.postMessage({
      type: 'productivitySync',
      sprintData: this._sprintData,
      calendarEvents: this._calendarEvents,
      habits: this._habits,
      hydrationData: this._hydrationData,
      pomodoroState: this._pomodoroState,
      pokemonData: this._pokemonData
    });
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._activeWebviewView = webviewView;
    const webview = webviewView.webview;

    webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webview.html = this._getHtmlForWebview(webview);
    this._registerWebview(webview);

    webviewView.onDidDispose(() => {
      this._webviews.delete(webview);
      if (this._activeWebviewView === webviewView) {
        this._activeWebviewView = undefined;
      }
    });
  }

  public createOrShowFullPage(): vscode.WebviewPanel {
    if (this._fullPagePanel) {
      this._fullPagePanel.reveal(vscode.ViewColumn.Active);
      return this._fullPagePanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'companion.fullPage',
      'Pixel Companion - Productivity & Wellness Suite',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri]
      }
    );

    panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'companion-icon.svg');
    panel.webview.html = this._getHtmlForWebview(panel.webview);
    this._registerWebview(panel.webview);

    panel.onDidDispose(() => {
      this._webviews.delete(panel.webview);
      this._fullPagePanel = undefined;
    });

    this._fullPagePanel = panel;
    return panel;
  }

  private _registerWebview(webview: vscode.Webview): void {
    this._webviews.add(webview);

    webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'ready':
          webview.postMessage({ type: 'config', config: this._config });
          this._broadcastProductivitySync();
          webview.postMessage({
            type: 'diagnostics',
            hasErrors: this._lastDiagnosticsState.hasErrors,
            errorCount: this._lastDiagnosticsState.errorCount
          });
          break;

        case 'openFullPage':
          this.createOrShowFullPage();
          break;

        case 'openBottomPanel':
          this.focusBottomPanel();
          break;

        case 'togglePomodoro':
          this.togglePomodoro();
          break;

        case 'resetPomodoro':
          this.resetPomodoro();
          break;

        case 'setPomoPreset':
          if (message.work && message.break) {
            this._pomodoroState.timeLeft = message.work * 60;
            this._pomodoroState.totalTime = message.work * 60;
            this._pomodoroState.mode = 'idle';
            this._pomodoroState.isRunning = false;
            this._persistData();
            this._broadcastProductivitySync();
          }
          break;

        case 'logWater':
          this.logWater();
          break;

        case 'updateSprint':
          if (message.sprintData) {
            this._sprintData = message.sprintData;
            await this._persistData();
            this._broadcastProductivitySync();
          }
          break;

        case 'updateCalendar':
          if (message.calendarEvents) {
            this._calendarEvents = message.calendarEvents;
            await this._persistData();
            this._broadcastProductivitySync();
          }
          break;

        case 'updateHabits':
          if (message.habits) {
            this._habits = message.habits;
            await this._persistData();
            this._broadcastProductivitySync();
          }
          break;

        case 'savePokemonData':
          if (message.pokemonData) {
            this._pokemonData = message.pokemonData;
            await this._persistData();
            this._broadcastProductivitySync();
          }
          break;

        case 'setCharacter':
          if (message.character) {
            this._config.character = message.character;
            const config = vscode.workspace.getConfiguration('companion');
            await config.update('character', message.character, vscode.ConfigurationTarget.Global);
            this.postMessage({ type: 'config', config: this._config });
          }
          break;

        case 'setAccessory':
          this._config.accessory = message.accessory || null;
          this.postMessage({ type: 'config', config: this._config });
          break;

        case 'setStyleMode':
          if (message.styleMode) {
            this._config.styleMode = message.styleMode;
            const config = vscode.workspace.getConfiguration('companion');
            await config.update('styleMode', message.styleMode, vscode.ConfigurationTarget.Global);
            this.postMessage({ type: 'config', config: this._config });
          }
          break;

        case 'saveCustomPicture':
          if (message.dataUrl !== undefined) {
            this._config.customPicture = message.dataUrl;
            const config = vscode.workspace.getConfiguration('companion');
            await config.update('customPicture', message.dataUrl, vscode.ConfigurationTarget.Global);
            if (message.dataUrl) {
              await config.update('character', 'custom', vscode.ConfigurationTarget.Global);
            }
            this.postMessage({ type: 'config', config: this._config });
          }
          break;

        case 'requestNativeUpload':
          await this.promptUploadPicture();
          break;
      }
    });
  }

  public async promptUploadPicture(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      title: 'Select Companion Picture',
      filters: {
        Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
      }
    });

    if (!uris || uris.length === 0) return;

    try {
      const fileData = await vscode.workspace.fs.readFile(uris[0]);
      const ext = uris[0].path.split('.').pop()?.toLowerCase() || 'png';
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      const base64Data = Buffer.from(fileData).toString('base64');
      const dataUrl = `data:${mime};base64,${base64Data}`;

      const config = vscode.workspace.getConfiguration('companion');
      await config.update('customPicture', dataUrl, vscode.ConfigurationTarget.Global);
      await config.update('character', 'custom', vscode.ConfigurationTarget.Global);

      this._config.customPicture = dataUrl;
      this._config.character = 'custom';
      this.postMessage({ type: 'config', config: this._config });

      vscode.window.showInformationMessage('Companion avatar picture updated successfully!');
    } catch (err) {
      vscode.window.showErrorMessage(`Failed to load image: ${err}`);
    }
  }

  public postMessage(message: CompanionMessageType): void {
    for (const webview of this._webviews) {
      webview.postMessage(message);
    }
  }

  public updateConfig(config: CompanionConfig): void {
    this._config = config;
    if (config.waterDailyGoal) {
      this._hydrationData.goal = config.waterDailyGoal;
    }
    this.postMessage({ type: 'config', config });
  }

  public triggerCelebrate(): void {
    this.postMessage({ type: 'celebrate' });
  }

  public toggleSleep(): void {
    this.postMessage({ type: 'toggleSleep' });
  }

  public handleTypingActivity(intensity: number): void {
    this.postMessage({ type: 'typing', intensity });
  }

  public handleDocumentSave(): void {
    this.postMessage({ type: 'celebrate' });
  }

  public handleDiagnostics(hasErrors: boolean, errorCount: number): void {
    this._lastDiagnosticsState = { hasErrors, errorCount };
    this.postMessage({ type: 'diagnostics', hasErrors, errorCount });
  }

  public handleTaskResult(exitCode: number | undefined): void {
    this.postMessage({ type: 'taskResult', exitCode });
  }

  public focus(): void {
    if (this._activeWebviewView) {
      this._activeWebviewView.show?.(true);
    } else if (this._fullPagePanel) {
      this._fullPagePanel.reveal();
    } else {
      vscode.commands.executeCommand(`${CompanionViewProvider.viewType}.focus`);
    }
  }

  public focusBottomPanel(): void {
    vscode.commands.executeCommand('companion.view.panel.focus');
  }

  public dispose(): void {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
    }
  }

  private _getNonce(): string {
    return crypto.randomBytes(16).toString('base64');
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js')
    );
    const charactersScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'characters.js')
    );
    const dialogueScriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'dialogue.js')
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'style.css')
    );
    const buddyStyleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'buddy.css')
    );
    const spritesUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'sprites')
    );
    const pokemonUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'media', 'pokemon')
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
  <link href="${buddyStyleUri}" rel="stylesheet" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Pixel Companion: Sprints & Pokémon</title>
</head>
<body>
  <div id="appContainer">
    <!-- 1. Top Navigation Tabs -->
    <nav id="navTabs">
      <button class="nav-tab active" data-tab="sprint">🏃 Sprints</button>
      <button class="nav-tab" data-tab="pomodoro">🍅 Pomodoro</button>
      <button class="nav-tab" data-tab="water">💧 Water</button>
      <button class="nav-tab" data-tab="calendar">📅 Calendar</button>
      <button class="nav-tab" data-tab="habits">⭐ Habits</button>
      <button class="nav-tab" data-tab="characters">⚡ Pokémon</button>
    </nav>

    <!-- 2. Productivity Content Area (Scrollable body) -->
    <main id="tabPanels">
      <!-- 1. SPRINT & TASKS PANEL (Active by default) -->
      <section id="sprintPanel" class="tab-panel active">
        <div class="card sprint-card">
          <div class="card-header">
            <div>
              <h3 id="sprintTitle">Sprint 14: Core Features</h3>
              <span id="sprintDates" class="subtext">Active Sprint</span>
            </div>
            <span id="sprintPercent" class="badge">75% Complete</span>
          </div>
          <div class="progress-bar">
            <div id="sprintBarFill" class="progress-fill" style="width: 75%;"></div>
          </div>
          <div class="input-row">
            <input type="text" id="taskInput" placeholder="Add sprint task (press Enter)..." />
            <select id="taskPrioritySelect">
              <option value="high">🔴 High</option>
              <option value="medium" selected>🟡 Medium</option>
              <option value="low">⚪ Low</option>
            </select>
            <button id="addTaskBtn" class="btn secondary">Add</button>
          </div>
          <ul id="tasksList" class="tasks-list">
            <!-- Dynamically populated sprint tasks -->
          </ul>
        </div>
      </section>

      <!-- 2. POMODORO PANEL -->
      <section id="pomodoroPanel" class="tab-panel">
        <div class="card pomo-card">
          <div class="card-header">
            <span id="pomoPhaseBadge" class="badge">FOCUS TIME</span>
            <div id="pomoRoundsVisual" class="rounds-indicator">
              <span class="round-dot active"></span>
              <span class="round-dot"></span>
              <span class="round-dot"></span>
              <span class="round-dot"></span>
            </div>
          </div>
          <!-- Circular Pomodoro Ring -->
          <div class="pomo-ring-container">
            <svg class="pomo-ring-svg" width="170" height="170" viewBox="0 0 180 180">
              <circle class="ring-bg" cx="90" cy="90" r="76" stroke-width="8" />
              <circle id="pomoRingProgress" class="ring-bar" cx="90" cy="90" r="76" stroke-width="8" stroke-dasharray="477.5" stroke-dashoffset="0" />
            </svg>
            <div class="pomo-ring-content">
              <h1 id="pomoClock">25:00</h1>
              <p id="pomoPhaseDesc" class="subtext">I'll train beside you 🍅</p>
            </div>
          </div>
          <div class="card-actions">
            <button id="pomoStartBtn" class="btn primary glow">Start Focus</button>
            <button id="pomoResetBtn" class="btn secondary">Reset</button>
          </div>
          <div class="preset-chips">
            <button class="chip active" data-pomo="25" data-break="5">🍅 25m Focus</button>
            <button class="chip" data-pomo="50" data-break="10">🧠 50m Deep</button>
            <button class="chip" data-pomo="15" data-break="3">⚡ 15m Sprint</button>
            <button class="chip" data-pomo="1" data-break="1">🧪 1m Demo</button>
          </div>
        </div>
      </section>

      <!-- 3. WATER & HYDRATION PANEL -->
      <section id="waterPanel" class="tab-panel">
        <div class="card water-card">
          <div class="card-header">
            <h3>Daily Hydration</h3>
            <span id="waterGoalBadge" class="badge">Goal: 8 Glasses</span>
          </div>
          <div class="water-glasses-row" id="waterGlassesRow">
            <!-- 8 interactive glasses -->
          </div>
          <div class="water-stats-grid">
            <div class="stat-box">
              <span class="stat-val" id="waterDrankCount">3</span>
              <span class="stat-lbl">Glasses Drank</span>
            </div>
            <div class="stat-box">
              <span class="stat-val" id="waterNextMins">38m</span>
              <span class="stat-lbl">Next Reminder</span>
            </div>
          </div>
          <button id="logWaterBtn" class="btn primary water-btn">💧 Log +1 Glass of Water</button>
        </div>
      </section>

      <!-- 4. CALENDAR & DEADLINES PANEL -->
      <section id="calendarPanel" class="tab-panel">
        <div class="card calendar-card">
          <div class="calendar-nav">
            <button id="calPrevMonth" class="cal-nav-btn">‹</button>
            <h3 id="calMonthTitle">November 2026</h3>
            <button id="calNextMonth" class="cal-nav-btn">›</button>
          </div>
          <div class="calendar-grid-header">
            <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
          </div>
          <div id="calendarDaysGrid" class="calendar-grid">
            <!-- 42 day cells -->
          </div>
          <div class="cal-day-detail">
            <h4 id="calSelectedDayHeader">Events on Today</h4>
            <div id="calDayEventsList" class="day-events-list"></div>
          </div>
          <div class="input-row cal-add-row">
            <input type="text" id="calEventTitle" placeholder="Milestone / meeting title..." />
            <input type="date" id="calEventDate" />
            <select id="calEventType">
              <option value="sprint">Sprint</option>
              <option value="meeting">Meeting</option>
              <option value="deadline">Deadline</option>
              <option value="milestone">Milestone</option>
            </select>
            <button id="addCalEventBtn" class="btn secondary">+</button>
          </div>
        </div>
      </section>

      <!-- 5. HABITS TRACKER PANEL -->
      <section id="habitsPanel" class="tab-panel">
        <div class="card habits-card">
          <div class="card-header">
            <h3>Daily Productivity Habits</h3>
            <span class="subtext">Weekly Streaks</span>
          </div>
          <ul id="habitsList" class="habits-list">
            <!-- Dynamically populated habits -->
          </ul>
        </div>
      </section>

      <!-- 6. POKÉMON & CHARACTERS PANEL -->
      <section id="charactersPanel" class="tab-panel">
        <div class="card char-card-panel">
          <div class="card-header">
            <h3>Choose Pokémon Companion</h3>
            <span class="badge">Gen 1-2 Classics</span>
          </div>
          <div class="poke-grid">
            <button class="pokemon-tile active" data-char="pikachu">
              <img src="${pokemonUri}/pikachu.gif" class="tile-poke-img" alt="Pikachu" />
              <span class="tile-poke-name">Pikachu</span>
              <span class="tile-poke-type">Electric ⚡</span>
            </button>
            <button class="pokemon-tile" data-char="charmander">
              <img src="${pokemonUri}/charmander.gif" class="tile-poke-img" alt="Charmander" />
              <span class="tile-poke-name">Charmander</span>
              <span class="tile-poke-type">Fire 🔥</span>
            </button>
            <button class="pokemon-tile" data-char="squirtle">
              <img src="${pokemonUri}/squirtle.gif" class="tile-poke-img" alt="Squirtle" />
              <span class="tile-poke-name">Squirtle</span>
              <span class="tile-poke-type">Water 💧</span>
            </button>
            <button class="pokemon-tile" data-char="bulbasaur">
              <img src="${pokemonUri}/bulbasaur.gif" class="tile-poke-img" alt="Bulbasaur" />
              <span class="tile-poke-name">Bulbasaur</span>
              <span class="tile-poke-type">Grass 🍃</span>
            </button>
            <button class="pokemon-tile" data-char="eevee">
              <img src="${pokemonUri}/eevee.gif" class="tile-poke-img" alt="Eevee" />
              <span class="tile-poke-name">Eevee</span>
              <span class="tile-poke-type">Normal ✨</span>
            </button>
            <button class="pokemon-tile" data-char="gengar">
              <img src="${pokemonUri}/gengar.gif" class="tile-poke-img" alt="Gengar" />
              <span class="tile-poke-name">Gengar</span>
              <span class="tile-poke-type">Ghost 👻</span>
            </button>
            <button class="pokemon-tile" data-char="snorlax">
              <img src="${pokemonUri}/snorlax.gif" class="tile-poke-img" alt="Snorlax" />
              <span class="tile-poke-name">Snorlax</span>
              <span class="tile-poke-type">Normal 💤</span>
            </button>
            <button class="pokemon-tile" data-char="psyduck">
              <img src="${pokemonUri}/psyduck.gif" class="tile-poke-img" alt="Psyduck" />
              <span class="tile-poke-name">Psyduck</span>
              <span class="tile-poke-type">Water 🌀</span>
            </button>
            <button class="pokemon-tile" data-char="jigglypuff">
              <img src="${pokemonUri}/jigglypuff.gif" class="tile-poke-img" alt="Jigglypuff" />
              <span class="tile-poke-name">Jigglypuff</span>
              <span class="tile-poke-type">Fairy 🎵</span>
            </button>
            <button class="pokemon-tile" data-char="mew">
              <img src="${pokemonUri}/mew.gif" class="tile-poke-img" alt="Mew" />
              <span class="tile-poke-name">Mew</span>
              <span class="tile-poke-type">Psychic 🌟</span>
            </button>
          </div>

          <div class="poke-stats-box">
            <h4>Sprint & Trainer XP System</h4>
            <p>Every sprint task completed awards <strong>+25 XP</strong> to your active Pokémon!</p>
            <div class="stats-row">
              <span>Task Done: <strong>+25 XP</strong></span>
              <span>Focus Done: <strong>+50 XP</strong></span>
              <span>Berry Fed: <strong>+5 XP</strong></span>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 3. The Roaming Pokémon Habitat (At the Bottom of the Sidebar) -->
    <div id="stageContainer">
      <div id="stageOverlay">
        <div id="stageLeftBadges">
          <span id="charNameBadge">⚡ Pikachu</span>
          <span id="pokemonLevelBadge" class="mini-badge lvl-badge">Lv. 1</span>
          <div class="xp-bar-container" title="Pokémon XP">
            <div id="pokemonXpFill" class="xp-bar-fill" style="width: 25%;"></div>
          </div>
          <span id="pokemonXpText" class="xp-text">25/100 XP</span>
        </div>
        <div id="stageActions">
          <button id="feedBerryBtn" class="pill-btn highlight" title="Feed Berry (+5 XP)">🍓</button>
          <button id="stageSleepBtn" class="pill-btn" title="Toggle Sleep">💤</button>
          <button id="quickSwapBtn" class="pill-btn" title="Swap Pokémon">⚡</button>
        </div>
      </div>

      <!-- Dialogue Speech Bubble -->
      <div id="bubble" class="bubble show pop">
        <div class="bubble-text" id="bubbleText">Pika-pi! Let's crush this sprint! ⚡</div>
      </div>

      <!-- Animated Roaming Habitat Floor -->
      <div id="stageHabitat">
        <div class="habitat-grass-line"></div>
        <div id="buddyTrack">
          <div id="buddy" class="buddy idle">
            <div class="pokemon-container">
              <img id="pokeSprite" class="pokemon-sprite" src="${pokemonUri}/pikachu.gif" alt="Pikachu" />
              <div class="shadow-ellipse"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    window.__POKEMON_BASE_URI__ = "${pokemonUri}/";
    window.__SPRITES_BASE_URI__ = "${spritesUri}/";
  </script>
  <script nonce="${nonce}" src="${charactersScriptUri}"></script>
  <script nonce="${nonce}" src="${dialogueScriptUri}"></script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}
