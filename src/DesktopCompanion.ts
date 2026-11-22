import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CharacterDef, pickLine } from './characters';

export interface CompanionAlert {
  text: string;
  /** Sticky alerts make the companion run over to the cursor and linger. */
  sticky?: boolean;
  mood?: 'alert' | 'angry' | 'happy';
}

/**
 * Launches and talks to the native desktop companion (helper/UnagiPet.cs),
 * a tiny always-on-top window that lets the character roam the whole screen.
 *
 * Windows only for now. The helper is compiled once with the csc.exe that ships
 * with every Windows install (.NET Framework 4), so no SDK or download is needed.
 */
export class DesktopCompanion implements vscode.Disposable {
  private _proc?: cp.ChildProcess;
  private _starting = false;
  private _stopping = false;
  private _crashes = 0;
  private _warned = false;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _onOpen: () => void,
    private readonly _onHide: () => void,
    private readonly _getCharacter: () => CharacterDef
  ) {}

  public static get supported(): boolean {
    return process.platform === 'win32';
  }

  public get running(): boolean {
    return !!this._proc;
  }

  public async start(): Promise<void> {
    if (!DesktopCompanion.supported || this._proc || this._starting) return;
    this._starting = true;
    this._stopping = false;
    try {
      const exe = await this._ensureExecutable();
      if (!exe || this._stopping) return;
      this._spawn(exe);
    } catch (err) {
      this._warn(`UNAGI: could not start the desktop companion (${err instanceof Error ? err.message : String(err)}).`);
    } finally {
      this._starting = false;
    }
  }

  public stop(): void {
    this._stopping = true;
    const proc = this._proc;
    this._proc = undefined;
    if (!proc) return;
    try {
      proc.stdin?.write('quit\n');
      proc.stdin?.end();
    } catch {
      /* already gone */
    }
    // Safety net: never leave a stray process behind.
    setTimeout(() => {
      if (proc.exitCode === null) proc.kill();
    }, 1500).unref();
  }

  public say(alert: CompanionAlert): void {
    const stdin = this._proc?.stdin;
    if (!stdin || !stdin.writable) return;
    // Plain text only: the helper's font can't draw emoji, and TAB/newline are the protocol's separators.
    const text = alert.text
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\uFE0F]/gu, '')
      .replace(/^\s*UNAGI:\s*/i, '')
      .replace(/[\t\r\n]+/g, ' ')
      .trim();
    if (!text) return;
    stdin.write(`say\t${alert.sticky ? 1 : 0}\t${alert.mood ?? 'none'}\t${text}\n`);
  }

  /** Tell the helper which character to show (also used when the setting changes). */
  public sendCharacter(): void {
    const stdin = this._proc?.stdin;
    if (!stdin || !stdin.writable) return;
    const c = this._getCharacter();
    const clean = (s: string) => s.replace(/[\t\r\n\u001f]+/g, ' ');
    const out: string[] = [`char\t${c.id}\t${c.kind}\t${c.facing}\t${c.height}`];
    if (c.image) out.push(`image\t${c.image.file}`);
    for (const [name, a] of Object.entries(c.anims)) {
      out.push(`anim\t${name}\t${a.file}\t${a.frames}\t${a.w}\t${a.h}\t${a.frameMs}\t${a.loop ? 1 : 0}`);
    }
    out.push(`lines\tpet\t${c.lines.pet.map(clean).join('\u001f')}`);
    out.push(`lines\tchatter\t${c.lines.chatter.map(clean).join('\u001f')}`);
    out.push('charend');
    out.push(`mode\t${this._movement()}`);
    stdin.write(out.join('\n') + '\n');
  }

  /** Walk along the bottom of the screen ('floor') or roam everywhere ('free'). */
  public sendMode(): void {
    const stdin = this._proc?.stdin;
    if (!stdin || !stdin.writable) return;
    stdin.write(`mode\t${this._movement()}\n`);
  }

  private _movement(): 'floor' | 'free' {
    return vscode.workspace.getConfiguration('unagi.companion').get<string>('movement', 'free') === 'floor' ? 'floor' : 'free';
  }

  public dispose(): void {
    this.stop();
  }

  // ------------------------------------------------------------------

  private _spawn(exe: string): void {
    const proc = cp.spawn(exe, [], { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true });
    this._proc = proc;
    proc.stdin?.on('error', () => undefined); // EPIPE if it dies mid-write

    let buffer = '';
    proc.stdout?.setEncoding('utf8');
    proc.stdout?.on('data', (chunk: string) => {
      buffer += chunk;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        this._onEvent(line);
      }
    });

    proc.on('exit', (code) => {
      if (this._proc === proc) this._proc = undefined;
      if (this._stopping || code === 0) return;
      // Crashed: retry a couple of times, then give up quietly.
      if (++this._crashes <= 3) {
        setTimeout(() => void this.start(), 3000).unref();
      }
    });
  }

  private _onEvent(line: string): void {
    switch (line) {
      case 'ready':
        this._crashes = 0;
        this.sendCharacter();
        this.say({ text: pickLine(this._getCharacter().lines.welcome), mood: 'happy' });
        break;
      case 'click':
        this._onOpen();
        break;
      case 'menu':
        void this._showMenu();
        break;
    }
  }

  private async _showMenu(): Promise<void> {
    const pick = await vscode.window.showQuickPick(
      [
        { label: '$(layout-sidebar-left) Open UNAGI', id: 'open' },
        { label: '$(eye-closed) Hide Croagunk', id: 'hide' }
      ],
      { placeHolder: 'Croagunk' }
    );
    if (pick?.id === 'open') this._onOpen();
    else if (pick?.id === 'hide') this._onHide();
  }

  /** Compile the helper if this exact version of its source hasn't been built yet. */
  private async _ensureExecutable(): Promise<string | undefined> {
    const source = vscode.Uri.joinPath(this._context.extensionUri, 'helper', 'UnagiPet.cs').fsPath;
    const code = fs.readFileSync(source);
    const hash = crypto.createHash('sha1').update(code).digest('hex').slice(0, 10);
    const dir = this._context.globalStorageUri.fsPath;
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, `unagi-pet-${hash}.exe`);
    if (fs.existsSync(exe)) return exe;

    const windir = process.env.windir || 'C:\\Windows';
    const csc = [
      path.join(windir, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
      path.join(windir, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
    ].find((p) => fs.existsSync(p));
    if (!csc) {
      this._warn('UNAGI: the desktop companion needs the .NET Framework 4 compiler, which was not found on this PC.');
      return undefined;
    }

    await new Promise<void>((resolve, reject) => {
      cp.execFile(
        csc,
        ['/nologo', '/target:winexe', '/optimize+', '/debug-', `/out:${exe}`,
          '/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', source],
        { windowsHide: true, timeout: 60000 },
        (err, stdout) => (err ? reject(new Error(String(stdout || err.message).trim())) : resolve())
      );
    });

    // Remove builds of older helper versions.
    for (const f of fs.readdirSync(dir)) {
      if (/^unagi-pet-.*\.exe$/.test(f) && path.join(dir, f) !== exe) {
        try { fs.unlinkSync(path.join(dir, f)); } catch { /* in use */ }
      }
    }
    return exe;
  }

  private _warn(message: string): void {
    if (this._warned) return;
    this._warned = true;
    void vscode.window.showWarningMessage(message);
  }
}
