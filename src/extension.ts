import * as vscode from 'vscode';
import { CompanionViewProvider } from './CompanionViewProvider';

export function activate(context: vscode.ExtensionContext): void {
  // Initialize UNAGI View Provider
  const provider = new CompanionViewProvider(context.extensionUri, context.globalState);

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
