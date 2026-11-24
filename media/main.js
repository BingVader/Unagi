/**
 * Sprint Desk: Developer Sprints, Tasks, Notes & Focus Timer Engine
 */
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // DOM Elements - Header & Clock
  const liveTime = document.getElementById('liveTime');
  const liveDate = document.getElementById('liveDate');
  const headerTimerPill = document.getElementById('headerTimerPill');
  const headerTimerText = document.getElementById('headerTimerText');

  // DOM Elements - Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // DOM Elements - Sprints & Tasks
  const sprintTabs = document.getElementById('sprintTabs');
  const newSprintBtn = document.getElementById('newSprintBtn');
  const newSprintForm = document.getElementById('newSprintForm');
  const newSprintName = document.getElementById('newSprintName');
  const newSprintType = document.getElementById('newSprintType');
  const newSprintRepeat = document.getElementById('newSprintRepeat');
  const createSprintBtn = document.getElementById('createSprintBtn');
  const cancelSprintBtn = document.getElementById('cancelSprintBtn');
  const sprintBadge = document.getElementById('sprintBadge');
  const sprintRepeatBtn = document.getElementById('sprintRepeatBtn');
  const sprintRenameBtn = document.getElementById('sprintRenameBtn');
  const sprintDeleteBtn = document.getElementById('sprintDeleteBtn');
  const sprintTitle = document.getElementById('sprintTitle');
  const sprintDates = document.getElementById('sprintDates');
  const sprintProgressFill = document.getElementById('sprintProgressFill');
  const sprintPercentText = document.getElementById('sprintPercentText');
  const reminderBanner = document.getElementById('reminderBanner');
  const reminderText = document.getElementById('reminderText');
  const taskInput = document.getElementById('taskInput');
  const taskPrioritySelect = document.getElementById('taskPrioritySelect');
  const addTaskBtn = document.getElementById('addTaskBtn');
  const filterChips = document.querySelectorAll('.filter-chip');
  const filterAllCount = document.getElementById('filterAllCount');
  const filterPendingCount = document.getElementById('filterPendingCount');
  const filterDoneCount = document.getElementById('filterDoneCount');
  const tasksList = document.getElementById('tasksList');

  // DOM Elements - Notes
  const notesArea = document.getElementById('notesArea');
  const notesCount = document.getElementById('notesCount');
  const notesStatus = document.getElementById('notesStatus');
  const copyNotesBtn = document.getElementById('copyNotesBtn');
  const clearNotesBtn = document.getElementById('clearNotesBtn');
  const fmtBtns = document.querySelectorAll('.fmt-btn');

  // DOM Elements - Timer
  const timerModeBadge = document.getElementById('timerModeBadge');
  const timerClock = document.getElementById('timerClock');
  const timerSubtext = document.getElementById('timerSubtext');
  const timerToggleBtn = document.getElementById('timerToggleBtn');
  const timerResetBtn = document.getElementById('timerResetBtn');
  const presetChips = document.querySelectorAll('.preset-chips .chip[data-mins]');

  // DOM Elements - Water reminder
  const waterEnabled = document.getElementById('waterEnabled');
  const waterInterval = document.getElementById('waterInterval');
  const waterHint = document.getElementById('waterHint');
  const waterChips = document.querySelectorAll('.chip[data-water]');

  // Internal State
  let state = {
    sprints: [{
      id: 'work-1',
      name: 'Sprint',
      type: 'work',
      repeat: 'none',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
      tasks: []
    }],
    activeSprintId: 'work-1',
    notes: '',
    timer: {
      isRunning: false,
      timeLeft: 25 * 60,
      totalTime: 25 * 60,
      mode: 'idle',
      round: 1
    }
  };

  let activeFilter = 'all'; // 'all' | 'pending' | 'done'
  let notesDebounceTimer = null;

  // =============================================================
  // 1. LIVE DIGITAL CLOCK
  // =============================================================
  function updateLiveClock() {
    const now = new Date();

    // Time: e.g. 11:28:45 PM
    if (liveTime) {
      liveTime.textContent = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    }

    // Date: e.g. Sunday, November 22, 2026
    if (liveDate) {
      liveDate.textContent = now.toLocaleDateString([], {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    }
  }

  setInterval(updateLiveClock, 1000);
  updateLiveClock();

  // Header Timer pill click jumps directly to timer tab
  if (headerTimerPill) {
    headerTimerPill.addEventListener('click', () => {
      switchTab('timer');
    });
  }

  // =============================================================
  // 2. TAB NAVIGATION
  // =============================================================
  function switchTab(tabId) {
    navTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    tabPanels.forEach(p => p.classList.toggle('active', p.id === `${tabId}Panel`));
  }

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });

  // =============================================================
  // 3. SPRINTS & TASKS ENGINE
  // =============================================================
  const TYPE_META = {
    personal: { icon: '🏡', label: 'Personal' },
    work: { icon: '💼', label: 'Work' }
  };

  function activeSprint() {
    return state.sprints.find(sp => sp.id === state.activeSprintId) || state.sprints[0];
  }

  /** Send every sprint (and which one is open) to the extension, which validates and saves them. */
  function commitSprints() {
    vscode.postMessage({ command: 'updateSprints', sprints: state.sprints, activeSprintId: state.activeSprintId });
  }

  function formatSprintDates(sp) {
    if (sp.repeat === 'daily') {
      const streak = sp.streak > 0 ? ` · 🔥 ${sp.streak}-day streak` : '';
      return `Resets every day · today ${sp.startDate}${streak}`;
    }
    return `${sp.startDate} ~ ${sp.endDate}`;
  }

  function renderSprintTabs() {
    if (!sprintTabs) return;
    sprintTabs.textContent = '';
    state.sprints.forEach(sp => {
      const done = sp.tasks.filter(t => t.status === 'done').length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sprint-tab' + (sp.id === state.activeSprintId ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', sp.id === state.activeSprintId ? 'true' : 'false');
      btn.title = `${TYPE_META[sp.type].label} · ${sp.repeat === 'daily' ? 'repeats daily' : 'one-off'}`;
      const label = document.createElement('span');
      label.className = 'sprint-tab-name';
      label.textContent = `${TYPE_META[sp.type].icon}${sp.repeat === 'daily' ? '🔁' : ''} ${sp.name}`;
      const count = document.createElement('span');
      count.className = 'sprint-tab-count';
      count.textContent = `${done}/${sp.tasks.length}`;
      btn.appendChild(label);
      btn.appendChild(count);
      btn.addEventListener('click', () => {
        if (state.activeSprintId === sp.id) return;
        state.activeSprintId = sp.id;
        stopRename();
        deleteArmed = false;
        renderSprint();
        commitSprints();
      });
      sprintTabs.appendChild(btn);
    });
  }

  function renderSprint() {
    renderSprintTabs();
    const sp = activeSprint();
    if (!sp) return;
    if (!renaming && sprintTitle) sprintTitle.textContent = sp.name;
    if (sprintBadge) {
      sprintBadge.textContent = `${TYPE_META[sp.type].icon} ${TYPE_META[sp.type].label}`;
      sprintBadge.className = `badge badge-${sp.type}`;
    }
    if (sprintDates) sprintDates.textContent = formatSprintDates(sp);
    if (sprintRepeatBtn) {
      sprintRepeatBtn.textContent = sp.repeat === 'daily' ? '🔁 Daily: on' : '🔁 Daily: off';
      sprintRepeatBtn.classList.toggle('active', sp.repeat === 'daily');
    }
    if (sprintDeleteBtn) {
      sprintDeleteBtn.textContent = deleteArmed ? '⚠ Click again to delete' : '🗑 Delete';
      sprintDeleteBtn.disabled = state.sprints.length <= 1;
    }

    const total = sp.tasks.length;
    const done = sp.tasks.filter(t => t.status === 'done').length;
    const pending = total - done;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Progress bar
    if (sprintProgressFill) sprintProgressFill.style.width = `${pct}%`;
    if (sprintPercentText) sprintPercentText.textContent = `${pct}% Complete (${done}/${total})`;

    // Filter counts
    if (filterAllCount) filterAllCount.textContent = total;
    if (filterPendingCount) filterPendingCount.textContent = pending;
    if (filterDoneCount) filterDoneCount.textContent = done;

    // High-priority task reminder banner (across every sprint)
    const highPending = state.sprints.flatMap(s => s.tasks).filter(t => t.priority === 'high' && t.status !== 'done');
    if (reminderBanner && reminderText) {
      if (highPending.length > 0) {
        reminderBanner.classList.remove('hidden');
        reminderText.textContent = `⚠️ Reminder: ${highPending.length} high-priority task${highPending.length > 1 ? 's' : ''} pending!`;
      } else {
        reminderBanner.classList.add('hidden');
      }
    }

    // Render Task Items
    if (tasksList) {
      tasksList.innerHTML = '';

      const filteredTasks = sp.tasks.filter(t => {
        if (activeFilter === 'pending') return t.status !== 'done';
        if (activeFilter === 'done') return t.status === 'done';
        return true;
      });

      if (filteredTasks.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'task-empty-item';
        emptyLi.style.cssText = 'color: var(--muted); text-align: center; padding: 18px 0; font-size: 11px;';
        emptyLi.textContent = total === 0 ? 'No tasks in this sprint. Add one above!' : 'No tasks match current filter.';
        tasksList.appendChild(emptyLi);
        return;
      }

      filteredTasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.status}`;

        // Priority icon
        const dot = document.createElement('span');
        dot.className = 'task-priority-dot';
        dot.textContent = task.priority === 'high' ? '🔴' : (task.priority === 'low' ? '🟢' : '🟡');
        dot.title = `Priority: ${task.priority.toUpperCase()}`;

        // Checkbox icon
        const check = document.createElement('span');
        check.className = 'task-check';
        check.textContent = task.status === 'done' ? '☑' : (task.status === 'inprogress' ? '⏳' : '☐');

        // Task text
        const txt = document.createElement('span');
        txt.className = 'task-text';
        txt.textContent = task.text;

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.className = 'task-del-btn';
        delBtn.textContent = '✕';
        delBtn.title = 'Delete Task';
        delBtn.addEventListener('click', e => {
          e.stopPropagation();
          sp.tasks = sp.tasks.filter(t => t.id !== task.id);
          renderSprint();
          commitSprints();
        });

        li.appendChild(dot);
        li.appendChild(check);
        li.appendChild(txt);
        li.appendChild(delBtn);

        // Click task row to toggle status
        li.addEventListener('click', () => {
          task.status = task.status === 'done' ? 'todo' : 'done';
          renderSprint();
          commitSprints();
        });

        tasksList.appendChild(li);
      });
    }
  }

  // Filter Chips Click
  filterChips.forEach(chip => {
    chip.addEventListener('click', () => {
      filterChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter || 'all';
      renderSprint();
    });
  });

  // Add Task Handler
  function handleAddTask() {
    if (!taskInput) return;
    const text = taskInput.value.trim();
    if (!text) return;
    const sp = activeSprint();
    if (!sp) return;

    const priority = taskPrioritySelect ? taskPrioritySelect.value : 'medium';

    sp.tasks.unshift({
      id: String(Date.now()),
      text,
      priority,
      status: 'todo',
      createdAt: Date.now()
    });

    taskInput.value = '';
    renderSprint();
    commitSprints();
  }

  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', handleAddTask);
  }

  if (taskInput) {
    taskInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        handleAddTask();
      }
    });
  }

  // ----- Sprint management: create, rename, repeat daily, delete -----
  let renaming = false;
  let deleteArmed = false;
  let deleteTimer = null;
  const localDay = (offset) => {
    const d = new Date(Date.now() + (offset || 0) * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function showNewSprintForm(show) {
    if (!newSprintForm) return;
    newSprintForm.classList.toggle('hidden', !show);
    if (show && newSprintName) { newSprintName.value = ''; newSprintName.focus(); }
  }

  function createSprint() {
    const type = newSprintType ? newSprintType.value : 'personal';
    const repeat = newSprintRepeat ? newSprintRepeat.value : 'daily';
    const name = (newSprintName && newSprintName.value.trim()) ||
      (type === 'work' ? 'Work tasks' : 'Personal tasks');
    const today = localDay(0);
    const sp = {
      id: 'sp' + Date.now(),
      name,
      type,
      repeat,
      startDate: today,
      endDate: repeat === 'daily' ? today : localDay(7),
      tasks: []
    };
    if (repeat === 'daily') { sp.lastReset = today; sp.streak = 0; }
    state.sprints.push(sp);
    state.activeSprintId = sp.id;
    showNewSprintForm(false);
    renderSprint();
    commitSprints();
  }

  function stopRename(commit) {
    if (!renaming) return;
    renaming = false;
    const input = sprintTitle.querySelector('input');
    const sp = activeSprint();
    if (commit && input && input.value.trim() && sp) {
      sp.name = input.value.trim().slice(0, 60);
      commitSprints();
    }
    renderSprint();
  }

  function startRename() {
    const sp = activeSprint();
    if (!sp || renaming) return;
    renaming = true;
    sprintTitle.textContent = '';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'sprint-title-input';
    input.maxLength = 60;
    input.value = sp.name;
    input.setAttribute('aria-label', 'Sprint name');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') stopRename(true);
      else if (e.key === 'Escape') stopRename(false);
    });
    input.addEventListener('blur', () => stopRename(true));
    sprintTitle.appendChild(input);
    input.focus();
    input.select();
  }

  if (newSprintBtn) newSprintBtn.addEventListener('click', () => showNewSprintForm(newSprintForm.classList.contains('hidden')));
  if (createSprintBtn) createSprintBtn.addEventListener('click', createSprint);
  if (cancelSprintBtn) cancelSprintBtn.addEventListener('click', () => showNewSprintForm(false));
  if (newSprintName) newSprintName.addEventListener('keydown', e => { if (e.key === 'Enter') createSprint(); else if (e.key === 'Escape') showNewSprintForm(false); });
  if (sprintRenameBtn) sprintRenameBtn.addEventListener('click', startRename);

  if (sprintRepeatBtn) {
    sprintRepeatBtn.addEventListener('click', () => {
      const sp = activeSprint();
      if (!sp) return;
      sp.repeat = sp.repeat === 'daily' ? 'none' : 'daily';
      if (sp.repeat === 'daily') {
        sp.startDate = sp.endDate = localDay(0);
      } else {
        sp.startDate = localDay(0);
        sp.endDate = localDay(7);
      }
      renderSprint();
      commitSprints();
    });
  }

  // Deleting asks twice (a second click within 3 seconds) instead of a pop-up, which webviews don't allow.
  if (sprintDeleteBtn) {
    sprintDeleteBtn.addEventListener('click', () => {
      if (state.sprints.length <= 1) return;
      if (!deleteArmed) {
        deleteArmed = true;
        clearTimeout(deleteTimer);
        deleteTimer = setTimeout(() => { deleteArmed = false; renderSprint(); }, 3000);
        renderSprint();
        return;
      }
      clearTimeout(deleteTimer);
      deleteArmed = false;
      const id = state.activeSprintId;
      state.sprints = state.sprints.filter(sp => sp.id !== id);
      state.activeSprintId = state.sprints[0].id;
      renderSprint();
      commitSprints();
    });
  }

  // =============================================================
  // 4. SCRATCHPAD NOTES ENGINE
  // =============================================================
  function updateNotesCounts() {
    if (!notesArea || !notesCount) return;
    const text = notesArea.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    notesCount.textContent = `${words} word${words === 1 ? '' : 's'} | ${chars} char${chars === 1 ? '' : 's'}`;
  }

  if (notesArea) {
    notesArea.addEventListener('input', () => {
      updateNotesCounts();
      if (notesStatus) notesStatus.textContent = 'Saving...';
      clearTimeout(notesDebounceTimer);
      notesDebounceTimer = setTimeout(() => {
        state.notes = notesArea.value;
        vscode.postMessage({ command: 'updateNotes', notes: state.notes });
        if (notesStatus) notesStatus.textContent = 'Saved';
      }, 300);
    });
  }

  // Formatting Toolbar Buttons
  fmtBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!notesArea) return;
      const fmt = btn.dataset.fmt;
      const start = notesArea.selectionStart;
      const end = notesArea.selectionEnd;
      const current = notesArea.value;

      let insertion = '';
      if (fmt === 'todo') insertion = '- [ ] ';
      else if (fmt === 'bullet') insertion = '- ';
      else if (fmt === 'code') insertion = '\n```ts\n// Code snippet\n```\n';
      else if (fmt === 'h2') insertion = '## ';

      notesArea.value = current.substring(0, start) + insertion + current.substring(end);
      notesArea.focus();
      notesArea.selectionStart = notesArea.selectionEnd = start + insertion.length;

      // Trigger auto-save
      notesArea.dispatchEvent(new Event('input'));
    });
  });

  if (copyNotesBtn) {
    copyNotesBtn.addEventListener('click', async () => {
      if (!notesArea) return;
      try {
        await navigator.clipboard.writeText(notesArea.value);
        copyNotesBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyNotesBtn.textContent = '📋 Copy';
        }, 1500);
      } catch {
        // Fallback
        notesArea.select();
        document.execCommand('copy');
      }
    });
  }

  if (clearNotesBtn) {
    clearNotesBtn.addEventListener('click', () => {
      if (confirm('Clear the entire scratchpad?')) {
        if (notesArea) {
          notesArea.value = '';
          notesArea.dispatchEvent(new Event('input'));
        }
      }
    });
  }

  // =============================================================
  // 5. FOCUS CLOCK & TIMER ENGINE
  // =============================================================
  function renderTimer() {
    const tm = state.timer;
    const m = Math.floor(tm.timeLeft / 60);
    const s = tm.timeLeft % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    // Big clock display
    if (timerClock) timerClock.textContent = timeStr;

    // Header countdown pill
    if (headerTimerText) headerTimerText.textContent = timeStr;

    // Badge & subtext
    if (timerModeBadge) {
      if (tm.mode === 'break') {
        timerModeBadge.textContent = 'BREAK TIME';
        timerModeBadge.style.color = '#10b981';
        timerModeBadge.style.borderColor = '#10b981';
      } else {
        timerModeBadge.textContent = 'FOCUS SESSION';
        timerModeBadge.style.color = '#38bdf8';
        timerModeBadge.style.borderColor = 'rgba(56, 189, 248, 0.3)';
      }
    }

    if (timerSubtext) {
      timerSubtext.textContent = tm.mode === 'break'
        ? 'Rest your eyes, hydrate, and recharge ☕'
        : `Deep Work & Flow State (Round ${tm.round})`;
    }

    // Toggle button state
    if (timerToggleBtn) {
      timerToggleBtn.textContent = tm.isRunning ? 'Pause' : 'Start Focus';
      timerToggleBtn.className = `btn ${tm.isRunning ? 'secondary large' : 'primary large glow'}`;
    }
  }

  if (timerToggleBtn) {
    timerToggleBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'toggleTimer' });
    });
  }

  if (timerResetBtn) {
    timerResetBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'resetTimer' });
    });
  }

  presetChips.forEach(chip => {
    chip.addEventListener('click', () => {
      presetChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const mins = parseInt(chip.dataset.mins || '25', 10);
      const mode = chip.dataset.mode || 'focus';
      vscode.postMessage({ command: 'setTimerPreset', minutes: mins, mode });
    });
  });

  // =============================================================
  // 5b. WATER REMINDER
  // =============================================================
  function renderWater(w) {
    if (!w) return;
    if (waterEnabled) waterEnabled.checked = !!w.enabled;
    // Don't overwrite the number while the user is typing in it.
    if (waterInterval && document.activeElement !== waterInterval) waterInterval.value = w.intervalMinutes;
    waterChips.forEach(c => c.classList.toggle('active', Number(c.dataset.water) === w.intervalMinutes));
    const card = document.getElementById('waterCard');
    if (card) card.classList.toggle('off', !w.enabled);
    if (waterHint) {
      const m = w.intervalMinutes;
      const every = m % 60 === 0 ? (m === 60 ? 'hour' : `${m / 60} hours`) : `${m} minute${m === 1 ? '' : 's'}`;
      waterHint.textContent = w.enabled
        ? `Your companion will nudge you to drink water every ${every}.`
        : 'Water reminders are off.';
    }
  }

  function setWaterInterval(mins) {
    const n = Math.round(Number(mins));
    if (!isFinite(n)) return;
    vscode.postMessage({ command: 'setWater', intervalMinutes: Math.max(1, Math.min(480, n)) });
  }

  if (waterEnabled) waterEnabled.addEventListener('change', () => vscode.postMessage({ command: 'setWater', enabled: waterEnabled.checked }));
  if (waterInterval) {
    waterInterval.addEventListener('change', () => setWaterInterval(waterInterval.value));
    waterInterval.addEventListener('keydown', e => { if (e.key === 'Enter') { setWaterInterval(waterInterval.value); waterInterval.blur(); } });
  }
  waterChips.forEach(c => c.addEventListener('click', () => setWaterInterval(c.dataset.water)));

  // =============================================================
  // 6. VS CODE MESSAGE LISTENER
  // =============================================================
  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;

    switch (msg.type) {
      case 'sync':
        if (msg.state) {
          state = msg.state;
          if (window.UnagiPet) window.UnagiPet.onState(state);
          renderSprint();
          renderTimer();
          if (notesArea && notesArea.value !== state.notes) {
            notesArea.value = state.notes || '';
            updateNotesCounts();
          }
        }
        break;

      case 'timerAlert':
        renderTimer();
        break;

      case 'say':
        if (window.UnagiPet) {
          window.UnagiPet.onSay({ text: msg.text, mood: msg.mood, sticky: msg.sticky, goto: msg.goto, tab: msg.tab });
        }
        break;

      case 'water':
        renderWater(msg);
        break;

      case 'config':
        if (window.UnagiPet) window.UnagiPet.configure(msg.config);
        break;

      case 'companionPanel':
        if (window.UnagiCompanionPanel) window.UnagiCompanionPanel.render(msg.data);
        break;

      case 'taskReminder':
        if (reminderBanner && reminderText) {
          reminderBanner.classList.remove('hidden');
          reminderText.textContent = `⚠️ Reminder: ${msg.pendingCount} high-priority task${msg.pendingCount > 1 ? 's' : ''} pending!`;
        }
        break;
    }
  });

  // Initialize and notify extension host
  if (window.UnagiPet) window.UnagiPet.init({ openTab: switchTab });
  if (window.UnagiCompanionPanel) window.UnagiCompanionPanel.init(vscode);
  renderSprint();
  renderTimer();
  updateNotesCounts();
  vscode.postMessage({ command: 'ready' });
})();
