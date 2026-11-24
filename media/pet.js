/**
 * UNAGI Companion: a character that roams the whole webview, walks onto UI
 * elements, and delivers alerts / task notifications as speech bubbles.
 *
 * Characters come from the extension (see src/characters.ts):
 *   - kind 'vector': Croagunk, drawn below as inline SVG
 *   - kind 'sprite': PNG strips (one row of frames) described by an atlas
 *
 * Public API (window.UnagiPet), driven by main.js:
 *   init({ openTab })        build DOM + start the loop
 *   configure(cfg)           { enabled, character }
 *   onState(state)           every 'sync'; used for the greeting when the view opens
 *   onSay({ text, mood, sticky, goto, tab })
 *                            something the extension wants announced (task done, water, new day...)
 */
(function () {
  'use strict';

  const VECTOR_SIZE = 72;      // Croagunk's box
  const SPRITE_HEIGHT = 100;   // displayed height of sprite characters (px)
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------
  // Built-in vector art
  // ---------------------------------------------------------------
  const CROAGUNK_SVG = `
<svg viewBox="0 0 64 64" class="cg" aria-hidden="true">
  <ellipse class="cg-shadow" cx="32" cy="61" rx="15" ry="3" fill="rgba(0,0,0,.28)"/>
  <g class="cg-body">
    <g class="cg-leg a"><rect x="20" y="50" width="10" height="11" rx="4.5" fill="#2f4a7d"/></g>
    <g class="cg-leg b"><rect x="34" y="50" width="10" height="11" rx="4.5" fill="#2f4a7d"/></g>
    <ellipse cx="32" cy="42" rx="15" ry="13" fill="#4e72ae"/>
    <ellipse cx="32" cy="45" rx="9" ry="9" fill="#efe7cc"/>
    <g class="cg-arm a"><ellipse cx="15" cy="43" rx="4" ry="7.5" fill="#3d5f9b"/><circle cx="15" cy="50" r="3.2" fill="#efe7cc"/></g>
    <g class="cg-arm b"><ellipse cx="49" cy="43" rx="4" ry="7.5" fill="#3d5f9b"/><circle cx="49" cy="50" r="3.2" fill="#efe7cc"/></g>
    <g class="cg-head">
      <ellipse cx="32" cy="24" rx="19" ry="14" fill="#4e72ae"/>
      <path d="M13.5 22 Q32 9 50.5 22 Q50 30 42 28 Q32 25 22 28 Q14 30 13.5 22Z" fill="#1d2a47"/>
      <g class="cg-eyes">
        <ellipse cx="24" cy="22" rx="4.2" ry="3.6" fill="#f6efb0"/><circle cx="25.2" cy="22.3" r="1.9" fill="#161616"/>
        <ellipse cx="40" cy="22" rx="4.2" ry="3.6" fill="#f6efb0"/><circle cx="38.8" cy="22.3" r="1.9" fill="#161616"/>
      </g>
      <g class="cg-lids"><path d="M20 22.5 Q24 25 28 22.5 M36 22.5 Q40 25 44 22.5" stroke="#f6efb0" stroke-width="1.6" fill="none" stroke-linecap="round"/></g>
      <circle class="cg-sac l" cx="14" cy="30" r="6.2" fill="#e8553d"/>
      <circle class="cg-sac r" cx="50" cy="30" r="6.2" fill="#e8553d"/>
      <circle cx="12.3" cy="28.2" r="1.6" fill="#ff9a86"/><circle cx="48.3" cy="28.2" r="1.6" fill="#ff9a86"/>
      <path class="cg-mouth" d="M24 32.5 Q32 37.5 40 32.5" stroke="#1d2a47" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </g>
  </g>
  <g class="cg-zzz" fill="#9fb4e0" font-family="sans-serif" font-weight="700">
    <text x="46" y="14" font-size="9">z</text><text x="52" y="8" font-size="7">z</text>
  </g>
</svg>`;

  // Used until the extension sends the selected character.
  const FALLBACK = {
    id: 'croagunk', name: 'Croagunk', kind: 'vector', facing: 'right', height: VECTOR_SIZE, anims: {},
    lines: {
      welcome: ['Croa-gunk! Total awareness engaged.'], pet: ['Gunk!'], chatter: ['Unagi... stay aware.'],
      taskAdded: ['Noted: "{t}"'], taskDone: ['Task down!'], sprintComplete: ['Every task done!'],
      reminder: ['{n} high-priority task{s} still pending!'], ending: ['{sprint} ends {when} with {p} task{ps} left!'],
      water: ['Time for some water!'], focusDone: ['Focus session complete!'], breakDone: ['Break over!'], newDay: ['New day!']
    }
  };

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------
  const hooks = { openTab: null };
  // movement: 'free' = roam everywhere (and perch on UI), 'floor' = walk left/right along the bottom edge
  let cfg = { enabled: true, movement: 'free' };
  let vy = 0;                                         // fall speed (px/s), grows while in the air
  let dropping = false;                               // in the air after being let go: falls until it reaches the floor, then lands
  let def = FALLBACK;
  let PW = VECTOR_SIZE, PH = VECTOR_SIZE, FEET = 0.94;

  let layer, pet, sprite, strip, bubble, bubbleText;
  let x = 0, y = 0, tx = 0, ty = 0;
  let moving = false, speed = 40, face = 1, arriveCb = null;
  let dragging = false, rest = 'idle', mood = null;
  let seq = null, seqIdx = 0, seqTimer = null;       // fall -> land after being dropped
  let playing = null;                                 // anim currently shown (sprite characters)
  let current = null, bubbleTimer = null;
  const queue = [];
  let nextThink = 0, lastActive = Date.now(), lastFrame = 0;
  let seen = false;       // the first sync after the view opened has been handled
  let started = false;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const maxX = () => Math.max(0, window.innerWidth - PW);
  const maxY = () => Math.max(0, window.innerHeight - PH);
  const onFloor = () => cfg.movement === 'floor';
  const floorY = () => Math.max(0, maxY() - 2);
  const isSprite = () => def.kind === 'sprite';
  const isPhoto = () => def.kind === 'photo';
  const hasAnim = (n) => !!(def.anims && def.anims[n]);

  /** Pick a line (or fill a template) from the current character's dialogue. */
  function L(key, v) {
    let t = def.lines && def.lines[key] != null ? def.lines[key] : FALLBACK.lines[key];
    if (Array.isArray(t)) t = t.length ? pick(t) : FALLBACK.lines[key][0];
    v = v || {};
    const n = v.n || 0, p = v.p || 0;
    return String(t).replace(/\{n\}/g, n).replace(/\{s\}/g, n > 1 ? 's' : '').replace(/\{t\}/g, v.t || '')
      .replace(/\{when\}/g, v.when || '').replace(/\{p\}/g, p).replace(/\{ps\}/g, p > 1 ? 's' : '')
      .replace(/\{sprint\}/g, v.sprint || 'your sprint');
  }

  // ---------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------
  function build() {
    layer = document.createElement('div');
    layer.id = 'petLayer';
    pet = document.createElement('div');
    pet.className = 'pet idle';

    bubble = document.createElement('div');
    bubble.className = 'pet-bubble';
    bubble.setAttribute('role', 'status');
    bubble.setAttribute('aria-live', 'polite');
    bubbleText = document.createElement('div');
    bubbleText.className = 'pet-bubble-text';
    bubble.appendChild(bubbleText);

    sprite = document.createElement('div');
    sprite.className = 'pet-sprite';

    pet.appendChild(bubble);
    pet.appendChild(sprite);
    layer.appendChild(pet);
    document.body.appendChild(layer);
    setCharacter(def);

    bubble.addEventListener('click', (e) => {
      e.stopPropagation();
      const cb = current && current.onClick;
      dismiss();
      if (cb) cb();
    });
    bindPointer();
  }

  function setCharacter(next) {
    def = next || FALLBACK;
    playing = null;
    seq = null;
    clearTimeout(seqTimer);
    // Sprite and photo characters carry their display height (130px at 100%); scale it to this narrow view.
    const shown = Math.round((def.height || 130) * SPRITE_HEIGHT / 130);
    if (isSprite()) {
      const idle = def.anims.idle;
      PH = shown;
      PW = Math.round(idle.w * shown / idle.h);
      FEET = 1;
      sprite.innerHTML = '<div class="pet-strip"></div>';
      strip = sprite.firstChild;
      strip.addEventListener('animationend', onAnimEnd);
      ['idle', 'walk'].forEach((n) => { if (hasAnim(n)) { const im = new Image(); im.src = def.anims[n].url; } });
    } else if (isPhoto()) {
      // One image, animated with CSS transforms (bob, sway, hop, shake) per behaviour.
      PH = shown;
      PW = Math.round(def.image.w * shown / def.image.h);
      FEET = 1;
      strip = null;
      sprite.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'pet-photo';
      img.alt = '';
      img.draggable = false;
      img.src = def.image.url;
      sprite.appendChild(img);
    } else {
      PW = PH = VECTOR_SIZE;
      FEET = 0.94;
      sprite.innerHTML = CROAGUNK_SVG;
      strip = null;
    }
    pet.style.width = PW + 'px';
    pet.style.height = PH + 'px';
    pet.dataset.kind = def.kind;
    sprite.title = def.name;
    x = clamp(x, 0, maxX()); y = clamp(y, 0, maxY());
    if (pet.isConnected) { applyClasses(); render(); }
  }

  // Which animation plays for the current behaviour (sprite characters).
  function animFor(m) {
    const map = { walk: 'walk', alert: 'alert', angry: 'angry', happy: 'happy', drag: 'drag', idle: 'idle', sit: 'sit', sleep: 'sleep' };
    const want = map[m] || 'idle';
    if (hasAnim(want)) return want;
    if (m === 'angry' && hasAnim('alert')) return 'alert';
    return 'idle';
  }

  function playAnim(name) {
    const a = def.anims[name] || def.anims.idle;
    if (!a || playing === a || !strip) return;
    playing = a;
    strip.style.backgroundImage = 'url("' + a.url + '")';
    strip.style.backgroundSize = (a.frames * PW) + 'px ' + PH + 'px';
    strip.style.setProperty('--end', (-a.frames * PW) + 'px');
    strip.style.animation = 'none';
    void strip.offsetWidth; // restart
    if (a.frames > 1) {
      if (dropping && a === def.anims.fall) {
        // Falling: play the fall once and hold its last frame until the floor is reached (the landing takes over then).
        const last = a.frames - 1;
        strip.style.setProperty('--end', (-last * PW) + 'px');
        strip.style.animation = 'pet-strip ' + (last * a.frameMs) + 'ms steps(' + last + ') 1 forwards';
      } else {
        strip.style.animation = 'pet-strip ' + (a.frames * a.frameMs) + 'ms steps(' + a.frames + ') ' + (a.loop ? 'infinite' : '1');
      }
    }
  }

  function onAnimEnd() {
    if (!seq) return;
    nextInSeq();
  }

  function nextInSeq() {
    clearTimeout(seqTimer);
    seqIdx++;
    if (seq && seqIdx >= seq.length) { seq = null; nextThink = performance.now() + 1500; }
    applyClasses();
  }

  // Let go of the character: if it is above the floor it falls (the fall animation repeats while it is in the
  // air) and lands when it reaches the floor; if it is already on the floor it just settles with the landing.
  function release() {
    seq = null;
    clearTimeout(seqTimer);
    if (y < floorY() - 2) { dropping = true; vy = 0; applyClasses(); return; }
    y = floorY();
    land();
  }

  // The character just reached the floor: play the landing (when it has one), then carry on.
  function land() {
    dropping = false;
    clearTimeout(seqTimer);
    if (isSprite() && hasAnim('land')) {
      seq = ['land'];
      seqIdx = 0;
      const a = def.anims.land;
      seqTimer = setTimeout(() => { seq = null; applyClasses(); }, a.frames * a.frameMs + 400); // safety net
    } else {
      seq = null;
      nextThink = performance.now() + 1500;
    }
    applyClasses();
    render();
  }

  function applyClasses() {
    let m = dragging ? 'drag' : moving ? 'walk' : mood || rest;
    if (isSprite()) {
      const flip = (face > 0) !== (def.facing === 'right');
      const name = dropping && !dragging && hasAnim('fall') ? 'fall' : seq ? seq[seqIdx] : animFor(m);
      playAnim(name);
      pet.className = 'pet ' + (m === 'sleep' ? 'idle' : m) + (flip ? ' flip' : '') + (current ? ' talking' : '');
      return;
    }
    if (isPhoto()) {
      // Photos have no sit/sleep poses; those read as idle. Dropped photos tilt as they are carried.
      if (m === 'sit' || m === 'sleep') m = 'idle';
      pet.className = 'pet ' + m + (face < 0 ? ' flip' : '') + (current ? ' talking' : '');
      return;
    }
    if (m === 'angry') m = 'alert';
    pet.className = 'pet ' + m + (speed > 60 && moving ? ' run' : '') + (face < 0 ? ' left' : '') + (current ? ' talking' : '');
  }

  function render() {
    pet.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (current) {
      const below = y < PH + 12;
      bubble.classList.toggle('below', below);
      const bw = bubble.offsetWidth;
      const left = x + PW / 2 - bw / 2;
      const shift = clamp(left, 4, Math.max(4, window.innerWidth - bw - 4)) - left;
      bubble.style.setProperty('--shift', shift + 'px');
    }
  }

  // ---------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------
  function walkTo(px, py, spd, cb) {
    tx = clamp(px, 0, maxX());
    ty = clamp(py, 0, maxY());
    speed = spd;
    arriveCb = cb || null;
    if (reduceMotion) { x = tx; y = ty; arrive(); return; }
    if (Math.abs(tx - x) > 2) face = tx > x ? 1 : -1;
    moving = true;
    rest = 'idle';
    applyClasses();
  }

  function arrive() {
    moving = false;
    const cb = arriveCb;
    arriveCb = null;
    applyClasses();
    render();
    if (cb) cb();
  }

  // Feet stand on an element's top edge.
  function perchPoint(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 8) return null;
    return { x: r.left + rand(0, Math.max(0, r.width - PW)), y: r.top - PH * FEET };
  }

  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  }

  function wander() {
    if (onFloor()) { walkTo(rand(0, maxX()), floorY(), rand(30, 55)); return; }
    let target = null;
    if (Math.random() < 0.55) {
      const els = Array.from(document.querySelectorAll('#clockHeader, #navTabs, .card, .task-item, .reminder-banner')).filter(visible);
      if (els.length) target = perchPoint(pick(els));
    }
    if (!target) target = { x: rand(0, maxX()), y: rand(0, maxY()) };
    walkTo(target.x, target.y, rand(30, 55));
  }

  function think(ts) {
    nextThink = ts + rand(3500, 9000);
    if (reduceMotion || dragging || dropping || moving || current || seq) return;
    const canSit = def.kind === 'vector' || hasAnim('sit');
    const canSleep = def.kind === 'vector' || hasAnim('sleep');
    if (canSleep && Date.now() - lastActive > 150000 && rest !== 'sleep') { rest = 'sleep'; applyClasses(); return; }
    if (rest === 'sleep') return;
    const r = Math.random();
    if (r < 0.7) wander();
    else if (r < 0.85 && canSit) { rest = 'sit'; applyClasses(); setTimeout(() => { if (rest === 'sit') { rest = 'idle'; applyClasses(); } }, rand(3000, 6000)); }
    else if (r < 0.93 && queue.length === 0) say(L('chatter'), { quiet: true });
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    if (!cfg.enabled) return;
    const dt = Math.min(0.1, (ts - lastFrame) / 1000 || 0);
    lastFrame = ts;
    if (dropping && !dragging) {
      vy += 700 * dt;                                    // gravity: starts slow, so the fall is visible
      y = Math.min(floorY(), y + vy * dt);
      if (y >= floorY()) land();                          // reached the floor: use the landing
      render();
    }
    if (moving && !dragging && !dropping) {
      const dx = tx - x, dy = ty - y;
      const dist = Math.hypot(dx, dy);
      const step = speed * dt;
      if (dist <= step) { x = tx; y = ty; arrive(); }
      else {
        x += (dx / dist) * step;
        y += (dy / dist) * step;
        const f = dx >= 0 ? 1 : -1;
        if (Math.abs(dx) > 1 && f !== face) { face = f; applyClasses(); }
        render();
      }
    }
    if (ts >= nextThink) think(ts);
  }

  // ---------------------------------------------------------------
  // Speech / alerts
  // ---------------------------------------------------------------
  function wake() {
    lastActive = Date.now();
    if (rest === 'sleep') { rest = 'idle'; applyClasses(); }
  }

  /**
   * opts: { sticky, mood: 'alert'|'angry'|'happy', onClick, goto: Element, quiet }
   * `quiet` messages are dropped if something else is queued/showing.
   */
  function say(text, opts) {
    opts = opts || {};
    if (!cfg.enabled) return;
    if (opts.quiet && (current || queue.length)) return;
    queue.push({ text, ...opts });
    pump();
  }

  function pump() {
    if (current || !queue.length) return;
    current = queue.shift();
    wake();
    const msg = current;
    const show = () => {
      if (current !== msg) return;
      bubbleText.textContent = msg.text;
      bubble.classList.toggle('sticky', !!msg.sticky);
      bubble.classList.toggle('clickable', !!msg.onClick);
      bubble.classList.add('show');
      mood = msg.mood || null;
      applyClasses();
      render();
      clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(dismiss, msg.sticky ? 14000 : 4500 + msg.text.length * 45);
    };
    if (msg.goto && msg.goto.isConnected && visible(msg.goto) && !reduceMotion) {
      if (onFloor()) {
        // On the floor he can't climb: walk to the spot directly below the thing he's talking about.
        const r = msg.goto.getBoundingClientRect();
        walkTo(r.left + r.width / 2 - PW / 2, floorY(), 95, show);
        return;
      }
      const p = perchPoint(msg.goto);
      if (p) { walkTo(p.x, p.y, 95, show); return; }
    }
    show();
  }

  function dismiss() {
    clearTimeout(bubbleTimer);
    bubble.classList.remove('show');
    current = null;
    mood = null;
    nextThink = performance.now() + 2500;
    applyClasses();
    setTimeout(pump, 350);
  }

  // ---------------------------------------------------------------
  // Pointer: click to pet, drag to carry
  // ---------------------------------------------------------------
  function bindPointer() {
    let startX = 0, startY = 0, offX = 0, offY = 0, down = false, dragged = false;
    sprite.addEventListener('pointerdown', (e) => {
      down = true; dragged = false;
      startX = e.clientX; startY = e.clientY;
      offX = e.clientX - x; offY = e.clientY - y;
      sprite.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    sprite.addEventListener('pointermove', (e) => {
      if (!down) return;
      if (!dragged && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
      dragged = true;
      dragging = true; moving = false; dropping = false; seq = null; clearTimeout(seqTimer);
      x = clamp(e.clientX - offX, 0, maxX());
      y = clamp(e.clientY - offY, 0, maxY());
      applyClasses();
      render();
    });
    const up = () => {
      if (!down) return;
      down = false;
      wake();
      if (dragged) {
        dragging = false;
        nextThink = performance.now() + 3000;
        release();                                            // let go: falls to the floor (if in the air), then lands
      } else {
        queue.length = 0;
        if (current) dismiss();
        say(L('pet'), { mood: 'happy' });
      }
    };
    sprite.addEventListener('pointerup', up);
    sprite.addEventListener('pointercancel', up);
    ['mousemove', 'keydown'].forEach((ev) => document.addEventListener(ev, () => { lastActive = Date.now(); if (rest === 'sleep') wake(); }, { passive: true }));
  }

  // ---------------------------------------------------------------
  // Reacting to extension messages
  // ---------------------------------------------------------------
  const openSprint = () => hooks.openTab && hooks.openTab('sprint');

  function onState(state) {
    if (!state || !Array.isArray(state.sprints) || !started) { seen = !!(state && state.sprints); return; }
    if (seen) return;                                     // only the first sync after the view opens greets
    seen = true;
    // Greet, then flag anything urgent.
    setTimeout(() => {
      say(L('welcome'), { mood: 'happy' });
      const pending = state.sprints.flatMap((sp) => sp.tasks.filter((t) => t.status !== 'done').map((t) => ({ sp, t })));
      const high = pending.filter((x) => x.t.priority === 'high');
      // One-off sprints ending soon with work left (daily sprints end every night, so they don't count).
      const ending = state.sprints.map((sp) => ({ sp, days: sp.repeat === 'daily' ? null : daysLeft(sp.endDate), left: sp.tasks.filter((t) => t.status !== 'done').length }))
        .find((x) => x.days !== null && x.days <= 2 && x.left > 0);
      if (ending) {
        say(L('ending', { when: ending.days <= 0 ? 'today' : 'in ' + ending.days + ' day' + (ending.days > 1 ? 's' : ''), p: ending.left, sprint: ending.sp.name }),
          { sticky: true, mood: 'angry', onClick: openSprint, goto: document.getElementById('sprintProgressFill') });
      }
      if (high.length) {
        say(L('reminder', { n: high.length }), { sticky: true, mood: 'alert', onClick: openSprint, goto: document.getElementById('reminderBanner') });
      }
    }, 1200);
  }

  function daysLeft(endDate) {
    const end = Date.parse(endDate);
    if (isNaN(end)) return null;
    return Math.ceil((end - Date.now()) / 86400000);
  }

  // Elements the companion walks over to when it announces something.
  const GOTO = {
    reminder: 'reminderBanner', timer: 'headerTimerPill', water: 'waterCard', sprint: 'sprintProgressFill'
  };

  /** Something the extension wants announced: task done, water reminder, focus finished, new day... */
  function onSay(msg) {
    if (!msg || !msg.text) return;
    const text = String(msg.text).replace(/^\S*\s*UNAGI:\s*/, '');
    say(text, {
      sticky: !!msg.sticky,
      mood: msg.mood || null,
      goto: GOTO[msg.goto] ? document.getElementById(GOTO[msg.goto]) : null,
      onClick: msg.tab && hooks.openTab ? () => hooks.openTab(msg.tab) : null
    });
  }

  function configure(next) {
    if (!next) return;
    const was = cfg.enabled;
    if (typeof next.enabled === 'boolean') cfg.enabled = next.enabled;
    const moveChanged = (next.movement === 'floor' || next.movement === 'free') && next.movement !== cfg.movement;
    if (moveChanged) cfg.movement = next.movement;
    if (!layer) { if (next.character) def = next.character; return; } // init() builds with `def`

    if (moveChanged && onFloor() && !dragging) {
      // Switched to floor mode while up in the air: stop what he was doing and fall back down.
      moving = false; arriveCb = null;
      if (y < floorY() - 2) { dropping = true; vy = 0; }     // gravity takes him down, then the landing plays
      applyClasses();
    }

    let changed = false;
    if (next.character) {
      changed = next.character.id !== def.id;
      setCharacter(next.character); // also re-applied for the same id so edits take effect
    }
    layer.style.display = cfg.enabled ? '' : 'none';
    if (!cfg.enabled) { queue.length = 0; if (current) dismiss(); return; }
    // Greet on a switch or re-enable, but not at startup (the first sync already greets).
    if ((changed || !was) && seen) { wake(); say(L('welcome'), { mood: 'happy' }); }
  }

  function init(h) {
    Object.assign(hooks, h || {});
    if (layer) return;
    build();
    x = maxX() - 10;
    y = floorY();
    face = -1;
    layer.style.display = cfg.enabled ? '' : 'none';
    window.addEventListener('resize', () => {
      x = clamp(x, 0, maxX());
      y = onFloor() && !dragging ? floorY() : clamp(y, 0, maxY());   // keep standing on the floor as the view resizes
      if (moving) { tx = clamp(tx, 0, maxX()); ty = onFloor() ? floorY() : clamp(ty, 0, maxY()); }
      render();
    });
    applyClasses();
    render();
    nextThink = performance.now() + 4000;
    started = true;
    requestAnimationFrame(loop);
  }

  window.UnagiPet = { init, configure, onState, onSay, croagunkSvg: CROAGUNK_SVG };
})();
