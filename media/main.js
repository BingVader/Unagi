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
  const presetChips = document.querySelectorAll('.chip');

  // Internal State
  let state = {
    sprint: {
      name: 'Sprint 14: Core Features',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      tasks: []
    },
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
  function renderSprint() {
    const sp = state.sprint;
    if (sprintTitle) sprintTitle.textContent = sp.name;
    if (sprintDates) sprintDates.textContent = `${sp.startDate} ~ ${sp.endDate}`;

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

    // High-priority task reminder banner
    const highPending = sp.tasks.filter(t => t.priority === 'high' && t.status !== 'done');
    if (reminderBanner && reminderText) {
      if (highPending.length > 0) {
        reminderBanner.classList.remove('hidden');
        reminderText.textContent = `⚠️ Reminder: ${highPending.length} high-priority task${highPending.length > 1 ? 's' : ''} pending in this sprint!`;
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
          state.sprint.tasks = state.sprint.tasks.filter(t => t.id !== task.id);
          renderSprint();
          vscode.postMessage({ command: 'updateSprint', sprint: state.sprint });
        });

        li.appendChild(dot);
        li.appendChild(check);
        li.appendChild(txt);
        li.appendChild(delBtn);

        // Click task row to toggle status
        li.addEventListener('click', () => {
          if (task.status === 'done') {
            task.status = 'todo';
          } else {
            task.status = 'done';
          }
          renderSprint();
          vscode.postMessage({ command: 'updateSprint', sprint: state.sprint });
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

    const priority = taskPrioritySelect ? taskPrioritySelect.value : 'medium';

    state.sprint.tasks.unshift({
      id: String(Date.now()),
      text,
      priority,
      status: 'todo',
      createdAt: Date.now()
    });

    taskInput.value = '';
    renderSprint();
    vscode.postMessage({ command: 'updateSprint', sprint: state.sprint });
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
  // 6. VS CODE MESSAGE LISTENER
  // =============================================================
  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;

    switch (msg.type) {
      case 'sync':
        if (msg.state) {
          state = msg.state;
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

      case 'taskReminder':
        if (reminderBanner && reminderText) {
          reminderBanner.classList.remove('hidden');
          reminderText.textContent = `⚠️ Reminder: ${msg.pendingCount} high-priority task${msg.pendingCount > 1 ? 's' : ''} pending!`;
        }
        break;
    }
  });

  // Initialize and notify extension host
  renderSprint();
  renderTimer();
  updateNotesCounts();
  vscode.postMessage({ command: 'ready' });
})();
