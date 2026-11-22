/**
 * UNAGI Character Studio: turn pictures into a companion.
 *
 * Two modes, chosen up front:
 *  - ONE IMAGE: a single cut-out that the companion animates with puppet motion.
 *  - SEVERAL IMAGES: one picture / set of pictures / animated GIF or WebP per reaction
 *    (idle, walk, alert, angry, happy, carried, fall, land) - like the bundled Kurta Guy.
 *    Reactions you skip get automatic puppet motion from the idle image.
 *
 * All image work happens here in the webview, so any format the browser can decode works
 * with no dependencies. Multi mode produces the same PNG strips the bundled sprite
 * characters use, so both the in-view and the desktop companion play them unchanged.
 */
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);

  const MAX_SRC = 512;       // single mode: working size
  const MAX_OUT_H = 260;     // single mode: exported height
  const WORK_H = 260;        // multi mode: every frame is normalised to this height
  const FPS = 12;            // animated sources are resampled to about this rate
  const MAX_FRAMES = 48;     // ...and capped at this many frames
  const MAX_DECODE = 240;    // never decode more than this many frames from one file

  const SLOTS = [
    { key: 'idle',  label: 'Idle',    hint: 'Standing around',                  required: true },
    { key: 'walk',  label: 'Walking', hint: 'Walking along',                    auto: true },
    { key: 'alert', label: 'Alert',   hint: 'Pointing out a reminder',          auto: true },
    { key: 'angry', label: 'Angry',   hint: 'Sprint about to end',              auto: true },
    { key: 'happy', label: 'Happy',   hint: 'A task got done',                  auto: true },
    { key: 'drag',  label: 'Carried', hint: 'Being picked up',                  auto: true },
    { key: 'fall',  label: 'Falling', hint: 'Dropped (optional)',               once: true },
    { key: 'land',  label: 'Landing', hint: 'Hits the ground (optional)',       once: true }
  ];

  // ---- elements
  const nameIn = $('name'), removeBg = $('removeBg'), tol = $('tol'), tolVal = $('tolVal'), trim = $('trim');
  const size = $('size'), sizeVal = $('sizeVal'), saveBtn = $('save'), status = $('status');
  const stage = $('stage'), bgNote = $('bgNote'), facingSel = $('facing');
  const single = { drop: $('drop'), file: $('file'), preview: $('preview') };

  let mode = 'single';
  const say = (t, bad) => { status.textContent = t || ''; status.className = 'status' + (bad ? ' bad' : ''); };
  const canvasOf = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  const ctxOf = (c) => c.getContext('2d', { willReadFrequently: true });

  // =========================================================== shared image helpers
  function detectAlpha(c) {
    const d = ctxOf(c).getImageData(0, 0, c.width, c.height).data;
    let clear = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 200) clear++;
    return clear / (d.length / 4) > 0.02;
  }

  function borderColor(d, w, h) {
    const r = [], g = [], b = [];
    const take = (x, y) => { const i = (y * w + x) * 4; if (d[i + 3] > 16) { r.push(d[i]); g.push(d[i + 1]); b.push(d[i + 2]); } };
    for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { take(0, y); take(w - 1, y); }
    if (!r.length) return null;
    const med = (a) => { a.sort((p, q) => p - q); return a[a.length >> 1]; };
    return [med(r), med(g), med(b)];
  }

  /** Flood-fill the background away from the edges (bg: [r,g,b]); softens the cut edge. */
  function floodRemove(d, w, h, tolerance, bg) {
    if (!bg) return;
    const dist = (i) => {
      const dr = d[i] - bg[0], dg = d[i + 1] - bg[1], db = d[i + 2] - bg[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    };
    const gone = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    let sp = 0;
    const push = (p) => { if (!gone[p]) { const i = p * 4; if (d[i + 3] < 16 || dist(i) <= tolerance) { gone[p] = 1; stack[sp++] = p; } } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p / w) | 0;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (y > 0) push(p - w);
      if (y < h - 1) push(p + w);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x, i = p * 4;
        if (gone[p]) { d[i + 3] = 0; continue; }
        const edge = (x > 0 && gone[p - 1]) || (x < w - 1 && gone[p + 1]) || (y > 0 && gone[p - w]) || (y < h - 1 && gone[p + w]);
        if (edge) d[i + 3] = Math.round(d[i + 3] * Math.max(0.35, Math.min(1, dist(i) / (tolerance * 1.8))));
      }
    }
  }

  function bboxOf(d, w, h, into) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return into || null;
    if (!into) return { x0, y0, x1, y1 };
    return { x0: Math.min(into.x0, x0), y0: Math.min(into.y0, y0), x1: Math.max(into.x1, x1), y1: Math.max(into.y1, y1) };
  }

  // ======================================================================= ONE IMAGE
  let src = null, result = null, hasAlpha = false;

  async function loadSingle(f) {
    if (!f || !/^image\//.test(f.type)) { say('That does not look like an image file.', true); return; }
    try {
      const bmp = await createImageBitmap(f);
      const s = Math.min(1, MAX_SRC / Math.max(bmp.width, bmp.height));
      const c = canvasOf(Math.round(bmp.width * s), Math.round(bmp.height * s));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      src = c;
      hasAlpha = detectAlpha(c);
      removeBg.checked = !hasAlpha;
      bgNote.textContent = hasAlpha
        ? 'This image already has a transparent background, so nothing needs removing.'
        : 'No transparency found. "Remove plain background" works best on a solid-colour background.';
      if (!nameIn.value.trim()) nameIn.value = f.name.replace(/\.[^.]+$/, '').slice(0, 30);
      stage.classList.add('has-image');
      renderSingle();
    } catch (e) {
      say('Could not read that image. Try a JPG or PNG.', true);
    }
  }

  function processSingle() {
    const w = src.width, h = src.height;
    const c = canvasOf(w, h);
    const ctx = ctxOf(c);
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    if (removeBg.checked) floodRemove(img.data, w, h, Number(tol.value), borderColor(img.data, w, h));
    ctx.putImageData(img, 0, 0);

    let out = c;
    if (trim.checked) {
      const b = bboxOf(img.data, w, h);
      if (b) {
        const pad = 2, bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
        const t = canvasOf(bw + pad * 2, bh + pad * 2);
        t.getContext('2d').drawImage(c, b.x0, b.y0, bw, bh, pad, pad, bw, bh);
        out = t;
      }
    }
    const s = Math.min(1, MAX_OUT_H / out.height);
    if (s < 1) {
      const f = canvasOf(Math.round(out.width * s), Math.round(out.height * s));
      const fc = f.getContext('2d'); fc.imageSmoothingQuality = 'high'; fc.drawImage(out, 0, 0, f.width, f.height);
      out = f;
    }
    return out;
  }

  function renderSingle() {
    if (!src) return;
    result = processSingle();
    single.preview.src = result.toDataURL('image/png');
    single.preview.style.height = size.value + 'px';
    saveBtn.disabled = false;
    say('');
  }

  // ===================================================================== SEVERAL IMAGES
  const slotData = {};       // key -> { frames: [canvas @ WORK_H], frameMs, note }
  let multiOut = null;       // processed result for preview/saving
  let previewKey = 'idle', previewTimer = null;

  const naturalSort = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true });

  function scaledCanvas(srcImg, w, h) {
    const s = WORK_H / h;
    const c = canvasOf(Math.round(w * s), WORK_H);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(srcImg, 0, 0, c.width, c.height);
    return c;
  }

  /** Decode one file into frames. Animated GIF/WebP/APNG need ImageDecoder; otherwise we use the first frame. */
  async function decodeFile(file) {
    if (typeof ImageDecoder !== 'undefined' && /^image\/(gif|webp|png|apng)$/.test(file.type)) {
      try {
        const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
        await dec.tracks.ready;
        const n = Math.min(dec.tracks.selectedTrack.frameCount, MAX_DECODE);
        if (n > 1) {
          const out = [];
          for (let i = 0; i < n; i++) {
            const r = await dec.decode({ frameIndex: i, completeFramesOnly: true });
            const f = r.image;
            out.push({ canvas: scaledCanvas(f, f.displayWidth, f.displayHeight), delay: (f.duration || 0) / 1000 });
            f.close();
          }
          dec.close();
          return { frames: out, animated: true };
        }
        dec.close();
      } catch (e) { /* fall back to a still */ }
    }
    const bmp = await createImageBitmap(file);
    const c = scaledCanvas(bmp, bmp.width, bmp.height);
    if (bmp.close) bmp.close();
    return { frames: [{ canvas: c, delay: 0 }], animated: false };
  }

  /** Several still files become frames in filename order; one animated file is resampled to ~12 fps. */
  async function loadSlot(key, fileList) {
    const files = [...fileList].filter((f) => /^image\//.test(f.type)).sort(naturalSort);
    if (!files.length) { say('That does not look like an image file.', true); return; }
    say('Reading ' + SLOTS.find((s) => s.key === key).label.toLowerCase() + '...');
    try {
      let frames, frameMs, note;
      if (files.length > 1) {
        frames = [];
        for (const f of files) frames.push((await decodeFile(f)).frames[0].canvas);
        frameMs = 100;
        note = frames.length + ' images';
      } else {
        const d = await decodeFile(files[0]);
        if (!d.animated) {
          frames = [d.frames[0].canvas]; frameMs = 1000; note = 'still image';
        } else {
          const delays = d.frames.map((f) => (f.delay >= 20 ? f.delay : 100));
          const total = delays.reduce((a, b) => a + b, 0);
          // Resample down to ~12 fps, but never invent frames a slow source doesn't have.
          const count = Math.min(MAX_FRAMES, d.frames.length, Math.max(2, Math.round(total / 1000 * FPS)));
          const step = total / count;
          frames = []; let acc = 0, idx = 0;
          for (let k = 0; k < count; k++) {
            const t = k * step;
            while (idx < d.frames.length - 1 && acc + delays[idx] <= t) { acc += delays[idx]; idx++; }
            frames.push(d.frames[idx].canvas);
          }
          frameMs = Math.max(40, Math.min(500, Math.round(total / count)));
          note = 'animated, ' + frames.length + ' frames';
        }
      }
      slotData[key] = { frames, frameMs, note };
      if (key === 'idle' && !nameIn.value.trim()) nameIn.value = files[0].name.replace(/\.[^.]+$/, '').slice(0, 30);
      refreshSlotRow(key);
      stage.classList.add('has-image');
      previewKey = key;
      await renderMulti();
    } catch (e) {
      say('Could not read that file. Try a PNG, JPG, GIF or WebP.', true);
    }
  }

  function clearSlot(key) {
    delete slotData[key];
    refreshSlotRow(key);
    if (previewKey === key) previewKey = 'idle';
    renderMulti();
  }

  function buildSlots() {
    const host = $('slots');
    host.textContent = '';
    SLOTS.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'slot';
      row.id = 'slot-' + s.key;
      row.innerHTML =
        '<div class="slot-thumb" aria-hidden="true"></div>' +
        '<div class="slot-main"><div class="slot-title"></div><div class="slot-hint"></div><div class="slot-state"></div></div>' +
        '<div class="slot-actions"><button type="button" class="mini pick"></button><button type="button" class="mini clear" aria-label="Remove">✕</button></div>' +
        '<input type="file" accept="image/*" multiple hidden>';
      row.querySelector('.slot-title').textContent = s.label + (s.required ? ' *' : '');
      row.querySelector('.slot-hint').textContent = s.hint;
      const input = row.querySelector('input');
      row.querySelector('.pick').addEventListener('click', () => input.click());
      row.querySelector('.clear').addEventListener('click', () => clearSlot(s.key));
      input.addEventListener('change', () => { if (input.files && input.files.length) loadSlot(s.key, input.files); input.value = ''; });
      ['dragenter', 'dragover'].forEach((e) => row.addEventListener(e, (ev) => { ev.preventDefault(); row.classList.add('over'); }));
      ['dragleave', 'drop'].forEach((e) => row.addEventListener(e, (ev) => { ev.preventDefault(); row.classList.remove('over'); }));
      row.addEventListener('drop', (ev) => { if (ev.dataTransfer && ev.dataTransfer.files.length) loadSlot(s.key, ev.dataTransfer.files); });
      host.appendChild(row);
      refreshSlotRow(s.key);
    });
  }

  function refreshSlotRow(key) {
    const s = SLOTS.find((x) => x.key === key), row = $('slot-' + key), d = slotData[key];
    const thumb = row.querySelector('.slot-thumb');
    thumb.textContent = '';
    if (d) {
      const t = canvasOf(Math.round(d.frames[0].width * 44 / WORK_H), 44);
      t.getContext('2d').drawImage(d.frames[0], 0, 0, t.width, t.height);
      thumb.appendChild(t);
    }
    row.classList.toggle('filled', !!d);
    row.querySelector('.slot-state').textContent = d ? d.note : (s.auto ? 'Automatic motion from Idle' : s.required ? 'Required' : 'Skipped');
    row.querySelector('.pick').textContent = d ? 'Replace' : 'Choose…';
    row.querySelector('.clear').hidden = !d;
  }

  // ---- puppet motion for reactions the user did not provide (mirrors the desktop helper's PhotoLook)
  function puppet(base, kind) {
    const w = base.width, h = base.height, k = h / 260 * 1.0;
    const frames = [];
    const make = (jump, shake, rot, sx, sy, hang) => {
      const c = canvasOf(w, h), x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      const cx = w / 2, py = hang ? 0 : h;
      x.translate(shake, -jump);
      x.translate(cx, py); x.rotate(rot * Math.PI / 180); x.scale(sx, sy); x.translate(-cx, -py);
      x.drawImage(base, 0, 0);
      return c;
    };
    switch (kind) {
      case 'walk':
        for (let f = 0; f < 8; f++) { const sn = Math.sin(f / 8 * Math.PI * 4); frames.push(make(6 * k * Math.abs(sn), 0, 3 * sn, 1, 1)); }
        return { frames, frameMs: 80 };
      case 'alert':
        for (let f = 0; f < 4; f++) frames.push(make(0, (f % 2 ? 2 : -2) * k, f % 2 ? 2 : -2, 1, 1));
        return { frames, frameMs: 100 };
      case 'angry':
        for (let f = 0; f < 4; f++) frames.push(make(0, (f % 2 ? 2 : -2) * k, f % 2 ? 1.5 : -1.5, f % 2 ? 1.07 : 1.04, f % 2 ? 1.07 : 1.04));
        return { frames, frameMs: 100 };
      case 'happy':
        for (let f = 0; f < 8; f++) { const t = f / 8; frames.push(make(16 * k * Math.sin(Math.PI * t), 0, 0, 1 + 0.04 * (f === 0 ? 1 : -.5), 1 - 0.07 * (f === 0 ? 1 : 0))); }
        return { frames, frameMs: 80 };
      case 'drag':
        for (let f = 0; f < 4; f++) frames.push(make(0, 0, f % 2 ? 8 : -8, 1, 1, true));
        return { frames, frameMs: 200 };
    }
    return null;
  }

  async function renderMulti() {
    if (!slotData.idle) {
      multiOut = null;
      saveBtn.disabled = true;
      say(Object.keys(slotData).length ? 'Add an Idle image too: it is the base for everything else.' : '');
      drawPreview();
      return;
    }
    const keys = SLOTS.map((s) => s.key).filter((k) => slotData[k]);

    // 1. cut the background away per reaction (colour sampled from its own first frame)
    let anyAlpha = false;
    const cut = {};
    for (const k of keys) {
      const fr = slotData[k].frames;
      const first = ctxOf(fr[0]).getImageData(0, 0, fr[0].width, fr[0].height);
      const alpha = detectAlpha(fr[0]);
      anyAlpha = anyAlpha || alpha;
      const bg = removeBg.checked && !alpha ? borderColor(first.data, fr[0].width, fr[0].height) : null;
      cut[k] = fr.map((c) => {
        const cc = canvasOf(c.width, c.height), x = ctxOf(cc);
        x.drawImage(c, 0, 0);
        if (bg) { const id = x.getImageData(0, 0, cc.width, cc.height); floodRemove(id.data, cc.width, cc.height, Number(tol.value), bg); x.putImageData(id, 0, 0); }
        return cc;
      });
      await new Promise((r) => setTimeout(r)); // keep the UI responsive
    }
    bgNote.textContent = removeBg.checked
      ? (anyAlpha ? 'Images that already have transparency are left as they are.' : 'Background removed from every frame (colour sampled at each reaction\'s edges).')
      : 'Background removal is off.';

    // 2. one common canvas: centre every reaction horizontally, keep feet on the bottom, crop to the union
    let Wmax = 0;
    keys.forEach((k) => cut[k].forEach((c) => { Wmax = Math.max(Wmax, c.width); }));
    const off = {}; let box = null;
    keys.forEach((k) => { off[k] = []; cut[k].forEach((c) => {
      const o = (Wmax - c.width) >> 1; off[k].push(o);
      const d = ctxOf(c).getImageData(0, 0, c.width, c.height);
      const b = bboxOf(d.data, c.width, c.height);
      if (b) box = box ? { x0: Math.min(box.x0, b.x0 + o), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1 + o), y1: Math.max(box.y1, b.y1) } : { x0: b.x0 + o, y0: b.y0, x1: b.x1 + o, y1: b.y1 };
    }); });
    if (!trim.checked || !box) box = { x0: 0, y0: 0, x1: Wmax - 1, y1: WORK_H - 1 };
    const pad = 2, bw = box.x1 - box.x0 + 1 + pad * 2, bh = box.y1 - box.y0 + 1 + pad * 2;
    const needPuppet = SLOTS.some((s) => s.auto && !slotData[s.key]);
    const padTop = needPuppet ? Math.round(bh * 0.14) : 0, padSide = needPuppet ? Math.round(bw * 0.12) : 0;
    const ow = bw + padSide * 2, oh = bh + padTop;

    const anims = {};
    for (const k of keys) {
      anims[k] = {
        frameMs: slotData[k].frameMs,
        frames: cut[k].map((c, i) => {
          const out = canvasOf(ow, oh);
          out.getContext('2d').drawImage(c, off[k][i] - box.x0 + pad + padSide, padTop - box.y0 + pad);
          return out;
        })
      };
    }
    // 3. automatic motion for the reactions that were not provided
    SLOTS.filter((s) => s.auto && !slotData[s.key]).forEach((s) => {
      const p = puppet(anims.idle.frames[0], s.key);
      if (p) anims[s.key] = { frames: p.frames, frameMs: p.frameMs, auto: true };
    });
    SLOTS.forEach((s) => { if (anims[s.key]) anims[s.key].loop = !s.once; });

    multiOut = { anims, w: ow, h: oh, bodyH: bh };
    saveBtn.disabled = false;
    say('');
    buildPreviewTabs();
    drawPreview();
    await Promise.resolve();
  }

  // ---- preview of the chosen reaction, played at its real speed
  function buildPreviewTabs() {
    const host = $('ptabs');
    host.textContent = '';
    SLOTS.forEach((s) => {
      const a = multiOut && multiOut.anims[s.key];
      if (!a) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ptab' + (s.key === previewKey ? ' on' : '');
      b.textContent = s.label + (a.auto ? ' (auto)' : '');
      b.addEventListener('click', () => { previewKey = s.key; buildPreviewTabs(); drawPreview(); });
      host.appendChild(b);
    });
  }

  function drawPreview() {
    clearTimeout(previewTimer);
    const cv = $('mpreview');
    if (!multiOut) { cv.width = 1; cv.height = 1; return; }
    const a = multiOut.anims[previewKey] || multiOut.anims.idle;
    cv.width = multiOut.w; cv.height = multiOut.h;
    cv.style.height = Math.round(Number(size.value) * multiOut.h / multiOut.bodyH) + 'px';
    const x = cv.getContext('2d');
    let i = 0;
    const tick = () => {
      x.clearRect(0, 0, cv.width, cv.height);
      x.drawImage(a.frames[i % a.frames.length], 0, 0);
      i++;
      if (a.frames.length > 1) previewTimer = setTimeout(tick, a.frameMs);
    };
    tick();
  }

  // ===================================================================== mode switching + wiring
  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    $('singleBlock').hidden = m !== 'single';
    $('multiBlock').hidden = m !== 'multi';
    $('facingRow').hidden = m !== 'multi';
    stage.classList.toggle('multi', m === 'multi');
    if (m === 'multi') {
      stage.classList.toggle('has-image', !!slotData.idle);
      saveBtn.disabled = !multiOut;
      bgNote.textContent = 'Works best on solid-colour backgrounds. Images that already have transparency are left alone.';
      if (slotData.idle) renderMulti();
    } else {
      clearTimeout(previewTimer);
      stage.classList.toggle('has-image', !!src);
      saveBtn.disabled = !result;
      if (src) renderSingle();
    }
    say('');
  }

  function refresh() { return mode === 'multi' ? renderMulti() : renderSingle(); }

  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) setMode(r.value); }));

  single.file.addEventListener('change', () => loadSingle(single.file.files && single.file.files[0]));
  ['dragenter', 'dragover'].forEach((e) => single.drop.addEventListener(e, (ev) => { ev.preventDefault(); single.drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((e) => single.drop.addEventListener(e, (ev) => { ev.preventDefault(); single.drop.classList.remove('over'); }));
  single.drop.addEventListener('drop', (ev) => loadSingle(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]));
  single.drop.addEventListener('click', () => single.file.click());
  single.drop.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); single.file.click(); } });

  [removeBg, trim].forEach((el) => el.addEventListener('change', refresh));
  tol.addEventListener('input', () => { tolVal.textContent = tol.value; });
  tol.addEventListener('change', refresh);
  size.addEventListener('input', () => {
    sizeVal.textContent = size.value + ' px';
    single.preview.style.height = size.value + 'px';
    if (multiOut) $('mpreview').style.height = Math.round(Number(size.value) * multiOut.h / multiOut.bodyH) + 'px';
  });

  saveBtn.addEventListener('click', () => {
    const name = nameIn.value.trim();
    if (!name) { say('Give your character a name.', true); nameIn.focus(); return; }

    if (mode === 'single') {
      if (!result) return;
      saveBtn.disabled = true; say('Saving...');
      vscode.postMessage({ command: 'save', name, height: Number(size.value), w: result.width, h: result.height, dataUrl: result.toDataURL('image/png') });
      return;
    }
    if (!multiOut) return;
    saveBtn.disabled = true; say('Saving...');
    const anims = {};
    Object.keys(multiOut.anims).forEach((k) => {
      const a = multiOut.anims[k];
      const strip = canvasOf(multiOut.w * a.frames.length, multiOut.h);
      const x = strip.getContext('2d');
      a.frames.forEach((f, i) => x.drawImage(f, i * multiOut.w, 0));
      anims[k] = { dataUrl: strip.toDataURL('image/png'), frames: a.frames.length, w: multiOut.w, h: multiOut.h, frameMs: a.frameMs, loop: !!a.loop };
    });
    vscode.postMessage({
      command: 'saveSprite',
      name,
      facing: facingSel.value === 'left' ? 'left' : 'right',
      // keep the character's body at the chosen size even though the frame has padding around it
      height: Math.round(Number(size.value) * multiOut.h / multiOut.bodyH),
      anims
    });
  });

  window.addEventListener('message', (ev) => {
    const m = ev.data;
    if (m && m.type === 'error') { say(m.message, true); saveBtn.disabled = false; }
  });

  buildSlots();
  setMode('single');
})();
