/**
 * The sidebar's Companion tab: pick a character, choose how it moves, toggle the
 * companion and the desktop companion. The extension sends the data ('companionPanel')
 * and applies every change as a setting, so the sidebar, the settings UI and the
 * command palette always agree.
 */
(function () {
  'use strict';

  const HINTS = {
    floor: 'Walks left and right along the bottom, like a character in a side-scrolling game. Pick it up and let go to drop it back on the floor.',
    free: 'Roams everywhere: across the whole view and up onto cards and tabs.'
  };

  let api = null;
  const $ = (id) => document.getElementById(id);

  function post(msg) { if (api) api.postMessage(msg); }

  function thumb(c) {
    const el = document.createElement('div');
    el.className = 'thumb';
    if (c.kind === 'vector') {
      el.innerHTML = (window.UnagiPet && window.UnagiPet.croagunkSvg) || '';
    } else if (c.thumb && c.kind === 'photo') {
      const img = document.createElement('img');
      img.src = c.thumb.url; img.alt = ''; img.draggable = false;
      el.appendChild(img);
    } else if (c.thumb) {
      // First frame of a strip: the box is one frame wide, the background is `frames` boxes wide.
      el.style.aspectRatio = c.thumb.w + ' / ' + c.thumb.h;
      el.style.backgroundImage = 'url("' + c.thumb.url + '")';
      el.style.backgroundSize = (c.thumb.frames * 100) + '% 100%';
      el.style.backgroundRepeat = 'no-repeat';
    }
    return el;
  }

  function render(d) {
    if (!d) return;
    const grid = $('charGrid');
    if (!grid) return;
    const hadFocus = grid.contains(document.activeElement) ? document.activeElement.dataset.id : null;

    grid.textContent = '';
    d.characters.forEach((c) => {
      const item = document.createElement('div');
      item.className = 'char-item';

      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'char-card' + (c.id === d.current ? ' selected' : '');
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', c.id === d.current ? 'true' : 'false');
      card.dataset.id = c.id;
      card.title = c.name;
      card.appendChild(thumb(c));
      const name = document.createElement('span');
      name.className = 'char-name';
      name.textContent = c.name;
      card.appendChild(name);
      card.addEventListener('click', () => { if (c.id !== d.current) post({ command: 'selectCharacter', id: c.id }); });
      item.appendChild(card);

      if (c.custom) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'char-del';
        del.textContent = '✕';
        del.title = 'Delete ' + c.name;
        del.setAttribute('aria-label', 'Delete ' + c.name);
        del.addEventListener('click', (e) => { e.stopPropagation(); post({ command: 'deleteCharacter', id: c.id }); });
        item.appendChild(del);
      }
      grid.appendChild(item);
    });

    if (hadFocus) {
      const again = grid.querySelector('.char-card[data-id="' + CSS.escape(hadFocus) + '"]');
      if (again) again.focus();
    }

    const s = d.settings;
    $('compEnabled').checked = !!s.enabled;
    document.querySelectorAll('#moveSeg [data-move]').forEach((b) => {
      const on = b.dataset.move === s.movement;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $('moveHint').textContent = HINTS[s.movement] || '';

    const dt = $('compDesktop');
    dt.checked = !!s.desktop;
    dt.disabled = !s.desktopSupported;
    $('desktopHint').textContent = s.desktopSupported
      ? 'Lets your companion leave the sidebar and roam your whole screen, on top of any app. It replaces the in-view companion while on.'
      : 'Roaming the whole screen is Windows-only for now. The in-view companion works everywhere.';
    $('desktopCard').classList.toggle('disabled', !s.desktopSupported);
  }

  function init(vscodeApi) {
    api = vscodeApi;
    $('createCharBtn').addEventListener('click', () => post({ command: 'createCharacter' }));
    $('compEnabled').addEventListener('change', (e) => post({ command: 'setCompanionEnabled', value: e.target.checked }));
    $('compDesktop').addEventListener('change', (e) => post({ command: 'setDesktopCompanion', value: e.target.checked }));
    document.querySelectorAll('#moveSeg [data-move]').forEach((b) => {
      b.addEventListener('click', () => post({ command: 'setMovement', value: b.dataset.move }));
    });
  }

  window.UnagiCompanionPanel = { init, render };
})();
