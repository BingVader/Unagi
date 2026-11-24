import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CharacterDef } from './characters';

const MAX_PNG_BYTES = 4 * 1024 * 1024;
const MAX_STRIP_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;
/** The reactions a multi-image character can provide (see media/studio.js). */
const REACTIONS = ['idle', 'walk', 'alert', 'angry', 'happy', 'drag', 'fall', 'land'];
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Decode a `data:image/png;base64,...` URL. Returns the bytes, or a message saying what is wrong. */
function decodePng(dataUrl: unknown, maxBytes: number): Buffer | string {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl ?? ''));
  if (!match) return 'The image could not be processed.';
  const png = Buffer.from(match[1], 'base64');
  if (png.length > maxBytes) return 'That image is too large. Try a smaller one.';
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) return 'The image could not be processed.';
  return png;
}

/**
 * The "Create Character" panel. The webview does all the image work (see media/studio.js)
 * and sends back a transparent PNG; this class validates it and stores it as a character in
 * the user's global storage, outside the extension folder so it survives updates.
 */
export class CharacterStudio {
  private _panel?: vscode.WebviewPanel;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _userDir: string,
    private readonly _onCreated: (id: string) => void
  ) {}

  public open(): void {
    if (this._panel) {
      this._panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'unagi.studio',
      'UNAGI: Create Character',
      vscode.ViewColumn.Active,
      { enableScripts: true, localResourceRoots: [this._extensionUri] }
    );
    this._panel = panel;
    panel.webview.html = this._html(panel.webview);
    panel.onDidDispose(() => { this._panel = undefined; });
    panel.webview.onDidReceiveMessage((m) => this._onMessage(panel, m));
  }

  private _onMessage(panel: vscode.WebviewPanel, m: any): void {
    if (!m || (m.command !== 'save' && m.command !== 'saveSprite')) return;
    const fail = (message: string) => void panel.webview.postMessage({ type: 'error', message });

    // Everything below came from a webview: validate, don't trust.
    const name = String(m.name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 30);
    if (!name) return fail('Give your character a name.');
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 20) || 'character';
    const id = `${slug}-${crypto.randomBytes(3).toString('hex')}`;
    const dir = path.join(this._userDir, id);
    const lines = { welcome: [`${name} here. Let's get this sprint moving.`] };
    const height = Math.round(Number(m.height));

    try {
      if (m.command === 'save') {
        // ---- one image: stored as a 'photo' character (puppet motion)
        const png = decodePng(m.dataUrl, MAX_PNG_BYTES);
        if (typeof png === 'string') return fail(png);
        const w = Math.round(Number(m.w));
        const h = Math.round(Number(m.h));
        if (!(w >= 16 && w <= 2048 && h >= 16 && h <= 2048)) return fail('The image size looks wrong.');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'image.png'), png);
        fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({
          id, name, kind: 'photo', image: 'image.png', w, h,
          height: height >= 60 && height <= 300 ? height : 130, lines
        }, null, 2));
      } else {
        // ---- several images: one PNG strip per reaction, stored as a 'sprite' character
        const anims = m.anims && typeof m.anims === 'object' ? m.anims : {};
        const keys = Object.keys(anims);
        if (keys.length > REACTIONS.length || !keys.every(k => REACTIONS.includes(k))) return fail('Unknown reaction in the upload.');
        if (!anims.idle) return fail('An Idle image is required.');
        const atlas: Record<string, unknown> = {};
        const strips: Array<[string, Buffer]> = [];
        let total = 0, baseW = 0, baseH = 0;
        for (const key of keys) {
          const a = anims[key];
          const frames = Math.round(Number(a?.frames));
          const w = Math.round(Number(a?.w));
          const h = Math.round(Number(a?.h));
          const frameMs = Math.round(Number(a?.frameMs));
          if (!(frames >= 1 && frames <= 60 && w >= 8 && w <= 1024 && h >= 8 && h <= 1024 && frameMs >= 20 && frameMs <= 2000)) {
            return fail(`The "${key}" animation has invalid settings.`);
          }
          const png = decodePng(a.dataUrl, MAX_STRIP_BYTES);
          if (typeof png === 'string') return fail(`The "${key}" image: ${png}`);
          // The pixels must really be `frames` frames of w x h laid out in one row.
          if (png.length < 24 || png.readUInt32BE(16) !== frames * w || png.readUInt32BE(20) !== h) {
            return fail(`The "${key}" image does not match its frame size.`);
          }
          if (key === 'idle') { baseW = w; baseH = h; }
          total += png.length;
          if (total > MAX_TOTAL_BYTES) return fail('The images are too large in total. Try fewer or smaller ones.');
          strips.push([key, png]);
          atlas[key] = { file: `strips/${key}.png`, frames, w, h, frameMs, loop: !!a.loop };
        }
        // Every reaction must share the idle frame size: the companion's window is sized from idle.
        for (const key of keys) {
          const a = atlas[key] as { w: number; h: number };
          if (a.w !== baseW || a.h !== baseH) return fail('All reactions must use the same frame size.');
        }
        fs.mkdirSync(path.join(dir, 'strips'), { recursive: true });
        for (const [key, png] of strips) fs.writeFileSync(path.join(dir, 'strips', `${key}.png`), png);
        fs.writeFileSync(path.join(dir, 'atlas.json'), JSON.stringify(atlas, null, 2));
        fs.writeFileSync(path.join(dir, 'character.json'), JSON.stringify({
          id, name, kind: 'sprite', facing: m.facing === 'left' ? 'left' : 'right',
          height: height >= 60 && height <= 400 ? height : 130, lines
        }, null, 2));
      }
    } catch (err) {
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      return fail(`Could not save the character (${err instanceof Error ? err.message : String(err)}).`);
    }

    this._onCreated(id);
    void vscode.window.showInformationMessage(`UNAGI: "${name}" is now your companion.`);
    panel.dispose();
  }

  private _html(webview: vscode.Webview): string {
    const uri = (f: string) => webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', f));
    const nonce = crypto.randomBytes(16).toString('base64');
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data: blob:`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp};">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link href="${uri('studio.css')}" rel="stylesheet">
<title>Create Character</title>
</head>
<body>
<div class="wrap">
  <h1>Create your companion</h1>
  <p class="sub">Turn pictures into a character that roams, nudges you about tasks and reacts to your work.</p>

  <div class="modes-title" id="modesTitle">How many images do you have?</div>
  <div class="modes" role="radiogroup" aria-labelledby="modesTitle">
    <label class="mode">
      <input type="radio" name="mode" value="single" checked>
      <span class="mode-body"><strong>Just one image</strong><span>One picture. It bobs, sways, hops and shakes for each reaction.</span></span>
    </label>
    <label class="mode">
      <input type="radio" name="mode" value="multi">
      <span class="mode-body"><strong>Several images</strong><span>A picture or animation for each reaction (walking, angry, happy…), like Kurta Guy.</span></span>
    </label>
  </div>

  <div class="grid">
    <div class="card">
      <div id="singleBlock">
        <label class="drop" id="drop" tabindex="0" role="button" aria-label="Choose or drop a photo">
          <strong>Drop a photo here, or click to choose</strong>
          JPG, PNG, WebP or GIF. Everything stays on your computer.
        </label>
        <input type="file" id="file" accept="image/*">
      </div>

      <div id="multiBlock" hidden>
        <p class="hint intro">Add a picture for each reaction. Each can be one image, several images (used as frames, in filename order), or an animated GIF/WebP. Only <b>Idle</b> is required; anything you skip gets automatic motion from the Idle image. Use the same size and framing for every image if you can.</p>
        <div class="slots" id="slots"></div>
      </div>

      <label class="col">Name
        <input class="field" id="name" type="text" maxlength="30" placeholder="e.g. Sam">
      </label>

      <label class="col" id="facingRow" hidden>The character in my pictures is facing
        <select class="field" id="facing">
          <option value="right">Right</option>
          <option value="left">Left</option>
        </select>
      </label>

      <label class="row"><input type="checkbox" id="removeBg" checked> Remove plain background</label>
      <p class="hint" id="bgNote">Works best on a solid-colour background.</p>
      <label class="col">Background tolerance <span class="val" id="tolVal">40</span>
        <input type="range" id="tol" min="5" max="120" value="40">
      </label>

      <label class="row"><input type="checkbox" id="trim" checked> Trim empty space around the character</label>

      <label class="col">Size <span class="val" id="sizeVal">130 px</span>
        <input type="range" id="size" min="80" max="220" value="130">
      </label>

      <button class="save" id="save" disabled>Save and use as my companion</button>
      <div class="status" id="status" role="status" aria-live="polite"></div>
    </div>
    <div>
      <div class="stage" id="stage">
        <div class="empty">Your preview will appear here</div>
        <img id="preview" alt="Character preview">
        <canvas id="mpreview" aria-label="Character preview"></canvas>
      </div>
      <div class="ptabs" id="ptabs" role="tablist" aria-label="Preview a reaction"></div>
      <ul class="tips">
        <li>Full-body shots facing the camera or to one side work best.</li>
        <li>For a clean cut-out, use PNGs that already have a transparent background.</li>
        <li>If the cut-out eats into the person, lower the tolerance; if background is left, raise it.</li>
      </ul>
    </div>
  </div>
</div>
<script nonce="${nonce}" src="${uri('studio.js')}"></script>
</body>
</html>`;
  }
}

/** Ask which custom character to delete, confirm, and remove it. Returns the deleted id, if any. */
export async function deleteCustomCharacter(
  userDir: string,
  all: CharacterDef[],
  presetId?: string
): Promise<string | undefined> {
  const custom = all.filter(c => c.custom);
  if (!custom.length) {
    void vscode.window.showInformationMessage('UNAGI: you have no custom characters to delete.');
    return undefined;
  }
  // From the sidebar the character is already chosen; from the command palette we ask.
  const preset = presetId ? custom.find(c => c.id === presetId) : undefined;
  if (presetId && !preset) return undefined;
  const pick = preset
    ? { label: preset.name, id: preset.id }
    : await vscode.window.showQuickPick(
        custom.map(c => ({ label: c.name, description: c.id, id: c.id })),
        { placeHolder: 'Delete which custom character?' }
      );
  if (!pick) return undefined;
  const ok = await vscode.window.showWarningMessage(
    `Delete "${pick.label}"? This removes its saved image and cannot be undone.`,
    { modal: true },
    'Delete'
  );
  if (ok !== 'Delete') return undefined;

  // Only ever delete a direct child of the user character folder.
  const target = path.resolve(userDir, pick.id);
  if (path.dirname(target) !== path.resolve(userDir)) return undefined;
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch (err) {
    void vscode.window.showErrorMessage(`UNAGI: could not delete the character (${err instanceof Error ? err.message : String(err)}).`);
    return undefined;
  }
  return pick.id;
}
