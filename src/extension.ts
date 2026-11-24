import * as vscode from 'vscode';
import { CompanionViewProvider } from './CompanionViewProvider';
import { DesktopCompanion } from './DesktopCompanion';
import { CharacterStudio } from './CharacterStudio';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
  // Initialize UNAGI View Provider
  const provider = new CompanionViewProvider(context.extensionUri, context.globalState);
  const userCharacterDir = path.join(context.globalStorageUri.fsPath, 'characters');
  provider.setUserCharacterDir(userCharacterDir);

  // Status Bar Item for live Focus Timer & Sprints count
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'unagi.focus';
  context.subscriptions.push(statusBarItem);
  provider.setStatusBarItem(statusBarItem);

  // Register WebviewViewProvider for UNAGI Sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      CompanionViewProvider.viewType,
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    )
  );

  // Register Commands
  const registerCmd = (id: string, cb: () => void) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, cb));
  };

  registerCmd('unagi.focus', () => provider.focus());
  registerCmd('companion.focus', () => provider.focus());

  registerCmd('unagi.toggleTimer', () => provider.toggleTimer());
  registerCmd('companion.toggleTimer', () => provider.toggleTimer());

  registerCmd('unagi.openInEditor', () => provider.openInEditor());
  registerCmd('unagi.toggleCompanion', () => { void provider.toggleCompanion(); });

  // Desktop companion: a native always-on-top window that roams the whole screen (Windows).
  const desktopSetting = () => vscode.workspace.getConfiguration('unagi.desktopCompanion');
  const desktop = new DesktopCompanion(
    context,
    () => provider.focus(),
    () => { void desktopSetting().update('enabled', false, vscode.ConfigurationTarget.Global); },
    () => provider.currentCharacter()
  );
  context.subscriptions.push(desktop, provider.onDidAlert(alert => desktop.say(alert)));

  const syncDesktop = () => {
    if (desktopSetting().get<boolean>('enabled', false)) void desktop.start();
    else desktop.stop();
  };
  syncDesktop();

  registerCmd('unagi.chooseCharacter', () => { void provider.chooseCharacter(); });

  // Custom characters made from photos live in global storage, so they survive extension updates.
  const studio = new CharacterStudio(context.extensionUri, userCharacterDir, id => {
    void vscode.workspace.getConfiguration('unagi.companion').update('character', id, vscode.ConfigurationTarget.Global);
  });
  registerCmd('unagi.createCharacter', () => studio.open());
  registerCmd('unagi.deleteCharacter', () => { void provider.deleteCharacter(); });

  registerCmd('unagi.toggleDesktopCompanion', () => {
    if (!DesktopCompanion.supported) {
      vscode.window.showInformationMessage('UNAGI: the desktop companion is Windows-only for now. The in-view companion still works.');
      return;
    }
    const next = !desktopSetting().get<boolean>('enabled', false);
    void desktopSetting().update('enabled', next, vscode.ConfigurationTarget.Global);
  });

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('unagi.desktopCompanion')) syncDesktop();
      if (e.affectsConfiguration('unagi.companion.character')) desktop.sendCharacter();
      if (e.affectsConfiguration('unagi.companion.movement')) desktop.sendMode();
      if (e.affectsConfiguration('unagi.companion') || e.affectsConfiguration('unagi.desktopCompanion')) {
        provider.broadcastCompanionConfig();
      }
    })
  );

  const handleAddTask = async () => {
    const taskText = await vscode.window.showInputBox({
      prompt: 'UNAGI: Enter new Sprint Task',
      placeHolder: 'e.g. Implement caching middleware'
    });

    if (!taskText || !taskText.trim()) return;

    const priorityPick = await vscode.window.showQuickPick(
      [
        { label: '🔴 High Priority', value: 'high' as const },
        { label: '🟡 Medium Priority', value: 'medium' as const },
        { label: '🟢 Low Priority', value: 'low' as const }
      ],
      { placeHolder: 'Select Task Priority' }
    );

    const priority = priorityPick ? priorityPick.value : 'medium';
    provider.addQuickTask(taskText.trim(), priority);
    vscode.window.showInformationMessage(`UNAGI: Sprint Task added: "${taskText.trim()}"`);
  };

  registerCmd('unagi.addTask', handleAddTask);
  registerCmd('companion.addTask', handleAddTask);
}

export function deactivate(): void {}
