import * as fs from 'fs';
import * as path from 'path';

/** Every scenario the companion speaks about. Each holds one or more alternatives; one is picked at random. */
export interface LineSet {
  welcome: string[];
  pet: string[];
  chatter: string[];
  taskAdded: string[];
  taskDone: string[];
  sprintComplete: string[];
  reminder: string[];
  ending: string[];
  water: string[];
  focusDone: string[];
  breakDone: string[];
  newDay: string[];
}

export type LineKey = keyof LineSet;

/** Scenario metadata for the dialogue editor in the sidebar. */
export const SCENARIOS: Array<{ key: LineKey; label: string; hint: string; vars: string[] }> = [
  { key: 'welcome', label: 'Greeting', hint: 'When the companion appears or you switch characters.', vars: [] },
  { key: 'pet', label: 'Petting', hint: 'When you click the companion.', vars: [] },
  { key: 'chatter', label: 'Idle chatter', hint: 'Things it says now and then while idle.', vars: [] },
  { key: 'taskAdded', label: 'Task added', hint: 'When you add a task.', vars: ['{t} task text', '{sprint} sprint name'] },
  { key: 'taskDone', label: 'Task completed', hint: 'When you finish a task.', vars: ['{t} task text', '{sprint} sprint name'] },
  { key: 'sprintComplete', label: 'Sprint completed', hint: 'When every task in a sprint is done.', vars: ['{sprint} sprint name'] },
  { key: 'reminder', label: 'High-priority reminder', hint: 'Periodic nudge about pending high-priority tasks.', vars: ['{n} task count', '{s} plural "s"'] },
  { key: 'ending', label: 'Sprint ending soon', hint: 'When a sprint ends soon with work left.', vars: ['{sprint} sprint name', '{when} today / tomorrow', '{p} tasks left', '{ps} plural "s"'] },
  { key: 'water', label: 'Water reminder', hint: 'Every time it is time to drink water.', vars: [] },
  { key: 'focusDone', label: 'Focus session finished', hint: 'When a focus timer ends and the break begins.', vars: [] },
  { key: 'breakDone', label: 'Break finished', hint: 'When a break ends.', vars: [] },
  { key: 'newDay', label: 'New day (daily sprints)', hint: 'When a daily sprint resets for the new day.', vars: ['{sprint} sprint name', '{p} tasks to do', '{ps} plural "s"'] }
];

export interface AnimDef {
  /** Absolute path of the PNG strip (frames laid out in one row). */
  file: string;
  frames: number;
  w: number;
  h: number;
  frameMs: number;
  loop: boolean;
}

export interface PhotoDef {
  /** Absolute path of the transparent PNG. */
  file: string;
  w: number;
  h: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  /**
   * 'vector': drawn in code (Croagunk). 'sprite': plays PNG strips (media/sprites).
   * 'photo': one user-supplied image, animated procedurally (bob, sway, hop, shake).
   */
  kind: 'vector' | 'sprite' | 'photo';
  facing: 'left' | 'right';
  /** Display height in px at 100% scaling (sprite and photo characters). */
  height: number;
  anims: Record<string, AnimDef>;
  /** Photo characters only. */
  image?: PhotoDef;
  /** True for characters created by the user (stored outside the extension, deletable). */
  custom?: boolean;
  lines: LineSet;
}

export const DEFAULT_CHARACTER = 'croagunk';

const CROAGUNK: CharacterDef = {
  id: 'croagunk',
  name: 'Croagunk',
  kind: 'vector',
  facing: 'right',
  height: 72,
  anims: {},
  lines: {
    welcome: ['Croa-gunk! Total awareness engaged.', "Gunk! I'll keep watch over your sprint."],
    pet: ['Gunk!', '*puffs cheek sacs happily*', 'Croa...', 'Careful, my fingers are poisonous!'],
    chatter: ['Unagi... stay aware.', 'Croak. Everything is quiet... for now.', 'Stretch those shoulders!'],
    taskAdded: ['Gunk. Noted: "{t}"'],
    taskDone: ['Poison Jab! Task down!', 'Gunk-tastic! One less to worry about.', 'Croa! Nicely done!'],
    sprintComplete: ['Every task done! {sprint} cleared!', 'Croa-croa! Sprint complete!'],
    reminder: ['Croa! {n} high-priority task{s} still pending!'],
    ending: ['{sprint} ends {when} with {p} task{ps} left!'],
    water: ['Hydrate, coder! Time for some water.', 'Croak! Water break, now.', 'Even a poison type needs water. Drink up!'],
    focusDone: ['Focus session complete! Take a short break.'],
    breakDone: ['Break over. Ready for total awareness again?'],
    newDay: ['New day, fresh {sprint}! {p} task{ps} to go.']
  }
};

/** Used for any line a sprite character's manifest doesn't override. */
const GENERIC_LINES: LineSet = {
  welcome: ['Total awareness engaged.'],
  pet: ['Hey there!'],
  chatter: ['Stay aware.', 'Steady progress wins the sprint.'],
  taskAdded: ['Noted: "{t}"'],
  taskDone: ['Task done. Nice work!'],
  sprintComplete: ['Every task done! {sprint} cleared!'],
  reminder: ['{n} high-priority task{s} still pending!'],
  ending: ['{sprint} ends {when} with {p} task{ps} left!'],
  water: ['Time for some water. Stay hydrated!'],
  focusDone: ['Focus session complete! Take a short break.'],
  breakDone: ['Break finished. Ready to focus again?'],
  newDay: ['New day, fresh {sprint}! {p} task{ps} to go.']
};

/** Merge a manifest's (or the user's) lines over a base set. Strings become one-item lists; `allDone` is the old name of `sprintComplete`. */
export function mergeLines(base: LineSet, extra: any): LineSet {
  const out: LineSet = { ...base };
  if (!extra || typeof extra !== 'object') return out;
  const src: any = { ...extra };
  if (src.sprintComplete == null && src.allDone != null) src.sprintComplete = src.allDone;
  for (const key of Object.keys(base) as LineKey[]) {
    const v = src[key];
    const list = (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])
      .map((x: unknown) => String(x).trim()).filter(Boolean);
    if (list.length) out[key] = list;
  }
  return out;
}

/** JSON.parse that tolerates a UTF-8 BOM (Windows tools like to add one). */
function readJson(file: string): any {
  return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
}

/**
 * Croagunk plus every folder in media/sprites that has a character.json
 * and a built atlas.json (run `npm run sprites` after adding a character).
 */
export function loadCharacters(extensionPath: string, userDir?: string): CharacterDef[] {
  const list: CharacterDef[] = [CROAGUNK];
  if (userDir) list.push(...loadUserCharacters(userDir, list));
  const root = path.join(extensionPath, 'media', 'sprites');
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return list;
  }
  for (const dir of dirs) {
    try {
      const base = path.join(root, dir);
      const manifest = readJson(path.join(base, 'character.json'));
      const id = String(manifest.id || dir);
      if (id === CROAGUNK.id || list.some(c => c.id === id)) continue;
      const c = readSpriteCharacter(base, manifest, id, false);
      if (c) list.push(c);
    } catch {
      /* not a character folder, or not built yet */
    }
  }
  return list;
}

/** A folder with character.json + atlas.json + the strips it names (bundled, or made in the studio). */
function readSpriteCharacter(base: string, manifest: any, id: string, custom: boolean): CharacterDef | undefined {
  const atlas = readJson(path.join(base, 'atlas.json'));
  const anims: Record<string, AnimDef> = {};
  for (const [name, a] of Object.entries<any>(atlas)) {
    const file = path.join(base, a.file);
    if (!fs.existsSync(file)) continue;
    anims[name] = { file, frames: a.frames, w: a.w, h: a.h, frameMs: a.frameMs, loop: !!a.loop };
  }
  if (!anims.idle) return undefined; // a character needs at least an idle animation
  return {
    id,
    name: String(manifest.name || id),
    kind: 'sprite',
    facing: manifest.facing === 'left' ? 'left' : 'right',
    height: Number(manifest.height) || 130,
    anims,
    custom: custom || undefined,
    lines: mergeLines(GENERIC_LINES, manifest.lines)
  };
}

/**
 * Characters the user made in the studio: <userDir>/<id>/character.json plus either
 * a single image.png ('photo', animated by puppet motion) or atlas.json + strips ('sprite').
 */
function loadUserCharacters(userDir: string, existing: CharacterDef[]): CharacterDef[] {
  const out: CharacterDef[] = [];
  let dirs: string[] = [];
  try {
    dirs = fs.readdirSync(userDir, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  } catch {
    return out;
  }
  for (const dir of dirs) {
    try {
      const base = path.join(userDir, dir);
      const m = readJson(path.join(base, 'character.json'));
      const id = String(m.id || dir);
      if (existing.some(c => c.id === id) || out.some(c => c.id === id)) continue;
      if (m.kind === 'sprite') {
        const c = readSpriteCharacter(base, m, id, true);
        if (c) out.push(c);
        continue;
      }
      if (m.kind !== 'photo') continue;
      const file = path.join(base, String(m.image || 'image.png'));
      if (!fs.existsSync(file)) continue;
      out.push({
        id,
        name: String(m.name || id),
        kind: 'photo',
        facing: 'right',
        height: Number(m.height) || 130,
        anims: {},
        image: { file, w: Number(m.w) || 100, h: Number(m.h) || 130 },
        custom: true,
        lines: mergeLines(GENERIC_LINES, m.lines)
      });
    } catch {
      /* unreadable or half-written; ignore */
    }
  }
  return out;
}

export function getCharacter(extensionPath: string, id: string, userDir?: string): CharacterDef {
  const all = loadCharacters(extensionPath, userDir);
  return all.find(c => c.id === id) ?? all[0];
}

export function pickLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)] ?? '';
}

/** Fill `{name}` placeholders; `{s}` / `{ps}` become "s" when `n` / `p` is more than one. */
export function fillLine(
  template: string,
  v: { n?: number; t?: string; when?: string; p?: number; sprint?: string }
): string {
  const n = v.n ?? 0;
  const p = v.p ?? 0;
  return template
    .replace(/\{n\}/g, String(n))
    .replace(/\{s\}/g, n > 1 ? 's' : '')
    .replace(/\{t\}/g, v.t ?? '')
    .replace(/\{when\}/g, v.when ?? '')
    .replace(/\{p\}/g, String(p))
    .replace(/\{ps\}/g, p > 1 ? 's' : '')
    .replace(/\{sprint\}/g, v.sprint ?? 'your sprint');
}
