import * as vscode from 'vscode';
import { CompanionViewProvider, CompanionConfig } from './CompanionViewProvider';

let typingDebounceTimer: NodeJS.Timeout | undefined;
let diagnosticDebounceTimer: NodeJS.Timeout | undefined;
let typingBurstScore = 0;

export function activate(context: vscode.ExtensionContext): void {
  // Initialize View Provider with global persistence
  const provider = new CompanionViewProvider(context.extensionUri, context.globalState);

  // Status Bar Item for Pomodoro countdown & Water status
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'companion.focus';
  context.subscriptions.push(statusBarItem);
  provider.setStatusBarItem(statusBarItem);

  // Register WebviewViewProvider for Sidebar, Explorer, and Bottom Panel
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CompanionViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    ),
    vscode.window.registerWebviewViewProvider(
      'companion.view.explorer',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    ),
    vscode.window.registerWebviewViewProvider(
      'companion.view.panel',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Helper to read current configuration
  const getConfiguration = (): CompanionConfig => {
    const config = vscode.workspace.getConfiguration('companion');
    return {
      scale: config.get<number>('scale', 2),
      reactToErrors: config.get<boolean>('reactToErrors', true),
      inactivityTimeoutSeconds: config.get<number>('inactivityTimeoutSeconds', 60),
      character: config.get<string>('character', 'pikachu'),
      accessory: config.get<string | null>('accessory', null),
      styleMode: config.get<string>('styleMode', 'pixel'),
      pomodoroFocusMinutes: config.get<number>('pomodoroFocusMinutes', 25),
      pomodoroBreakMinutes: config.get<number>('pomodoroBreakMinutes', 5),
      waterIntervalMinutes: config.get<number>('waterIntervalMinutes', 45),
      waterDailyGoal: config.get<number>('waterDailyGoal', 8),
      customPicture: config.get<string>('customPicture', '')
    };
  };

  // Push initial configuration
  provider.updateConfig(getConfiguration());

  // Configuration change listener
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('companion')) {
        provider.updateConfig(getConfiguration());
      }
    })
  );

  // Register Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('companion.focus', () => {
      provider.focus();
    }),
    vscode.commands.registerCommand('companion.openBottomPanel', () => {
      provider.focusBottomPanel();
    }),
    vscode.commands.registerCommand('companion.openFullPage', () => {
      provider.createOrShowFullPage();
    }),
    vscode.commands.registerCommand('companion.startPomodoro', () => {
      provider.togglePomodoro();
    }),
    vscode.commands.registerCommand('companion.logWater', () => {
      provider.logWater();
    }),
    vscode.commands.registerCommand('companion.selectCharacter', async () => {
      const items: (vscode.QuickPickItem & { charId: string })[] = [
        {
          label: '$(zap) Pikachu',
          description: 'Electric mouse Pokémon with thunderbolt sparks ⚡',
          charId: 'pikachu'
        },
        {
          label: '$(flame) Charmander',
          description: 'Fire lizard Pokémon with flickering tail flame 🔥',
          charId: 'charmander'
        },
        {
          label: '$(drop) Squirtle',
          description: 'Water turtle Pokémon with water bubbles 💧',
          charId: 'squirtle'
        },
        {
          label: '$(package) Bulbasaur',
          description: 'Grass Pokémon with vine whip and seed sprout 🍃',
          charId: 'bulbasaur'
        },
        {
          label: '$(sparkle) Eevee',
          description: 'Evolution Pokémon with energetic fluffy bounce ✨',
          charId: 'eevee'
        },
        {
          label: '$(ghost) Gengar',
          description: 'Ghost Pokémon with mischievous shadow grin 👻',
          charId: 'gengar'
        },
        {
          label: '$(clock) Snorlax',
          description: 'Sleepy giant Pokémon with gentle belly naps 💤',
          charId: 'snorlax'
        },
        {
          label: '$(beaker) Psyduck',
          description: 'Water duck Pokémon with psychic energy 🌀',
          charId: 'psyduck'
        },
        {
          label: '$(music) Jigglypuff',
          description: 'Fairy balloon Pokémon with melodious songs 🎵',
          charId: 'jigglypuff'
        },
        {
          label: '$(star) Mew',
          description: 'Mythical psychic Pokémon with glowing aura 🌟',
          charId: 'mew'
        },
        {
          label: '$(heart) Cute Dog',
          description: 'Desktop Buddy Dog with tail wagging and happy jumps',
          charId: 'dog'
        },
        {
          label: '$(gist) Cartoon Cat (Tom)',
          description: 'Desktop Buddy gray cartoon cat with playful whiskers',
          charId: 'tom'
        },
        {
          label: '$(glasses) Mohanlal (Lalettan)',
          description: 'Legendary Malayalam cinema icon with signature tilted swagger walk',
          charId: 'mohanlal'
        },
        {
          label: '$(organization) CJ (Carl Johnson - GTA San Andreas)',
          description: 'Ah shit, here we go again - white tank top & West Coast swagger',
          charId: 'cj'
        },
        {
          label: '$(file-media) Upload Custom Picture / Avatar...',
          description: 'Choose any image file (PNG, JPG, GIF, WebP, SVG) from your computer',
          charId: 'custom'
        }
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select your companion character model'
      });

      if (!selected) return;

      if (selected.charId === 'custom') {
        await provider.promptUploadPicture();
      } else {
        const config = vscode.workspace.getConfiguration('companion');
        await config.update('character', selected.charId, vscode.ConfigurationTarget.Global);
      }
    }),
    vscode.commands.registerCommand('companion.uploadPicture', async () => {
      await provider.promptUploadPicture();
    }),
    vscode.commands.registerCommand('companion.toggleSleep', () => {
      provider.toggleSleep();
    }),
    vscode.commands.registerCommand('companion.triggerCelebrate', () => {
      provider.triggerCelebrate();
    })
  );

  // 1. vscode.workspace.onDidChangeTextDocument
  // Debounced typing activity listener; triggers walk or run proportional to activity
  const TYPING_DEBOUNCE_MS = 250;
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.scheme !== 'file' && event.document.uri.scheme !== 'untitled') {
        return;
      }
      if (event.contentChanges.length === 0) {
        return;
      }

      const changeSize = event.contentChanges.reduce(
        (acc, ch) => acc + Math.max(1, ch.text.length),
        0
      );
      typingBurstScore += changeSize;

      if (typingDebounceTimer) {
        clearTimeout(typingDebounceTimer);
      }

      typingDebounceTimer = setTimeout(() => {
        const intensity = typingBurstScore >= 6 ? 2 : 1;
        provider.handleTypingActivity(intensity);
        typingBurstScore = 0;
      }, TYPING_DEBOUNCE_MS);
    })
  );

  // 2. vscode.workspace.onDidSaveTextDocument
  // Triggers brief celebration animation
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      provider.handleDocumentSave();
    })
  );

  // 3. vscode.languages.onDidChangeDiagnostics
  // Checks active editor error count
  const DIAGNOSTIC_DEBOUNCE_MS = 300;
  let lastErrorCount = 0;

  const evaluateDiagnostics = () => {
    const config = getConfiguration();
    if (!config.reactToErrors) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    let currentErrorCount = 0;

    if (activeEditor) {
      const diagnostics = vscode.languages.getDiagnostics(activeEditor.document.uri);
      currentErrorCount = diagnostics.filter(
        d => d.severity === vscode.DiagnosticSeverity.Error
      ).length;
    } else {
      const allDiagnostics = vscode.languages.getDiagnostics();
      for (const [, diags] of allDiagnostics) {
        currentErrorCount += diags.filter(
          d => d.severity === vscode.DiagnosticSeverity.Error
        ).length;
      }
    }

    const hasErrors = currentErrorCount > 0;
    if (currentErrorCount !== lastErrorCount) {
      lastErrorCount = currentErrorCount;
      provider.handleDiagnostics(hasErrors, currentErrorCount);
    }
  };

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics(() => {
      if (diagnosticDebounceTimer) {
        clearTimeout(diagnosticDebounceTimer);
      }
      diagnosticDebounceTimer = setTimeout(evaluateDiagnostics, DIAGNOSTIC_DEBOUNCE_MS);
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      evaluateDiagnostics();
    })
  );

  // 4. vscode.tasks.onDidEndTaskProcess
  // Celebrates (happy) when exitCode === 0, or triggers worried reaction when exitCode !== 0
  context.subscriptions.push(
    vscode.tasks.onDidEndTaskProcess(taskEvent => {
      provider.handleTaskResult(taskEvent.exitCode);
    })
  );

  // Cleanup on extension disposal
  context.subscriptions.push({
    dispose: () => {
      if (typingDebounceTimer) {
        clearTimeout(typingDebounceTimer);
      }
      if (diagnosticDebounceTimer) {
        clearTimeout(diagnosticDebounceTimer);
      }
      provider.dispose();
    }
  });
}

export function deactivate(): void {
  if (typingDebounceTimer) {
    clearTimeout(typingDebounceTimer);
  }
  if (diagnosticDebounceTimer) {
    clearTimeout(diagnosticDebounceTimer);
  }
}
