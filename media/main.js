/**
 * Pixel Companion: Sprints & Pokémon Edition
 * Interactive Pokémon Roaming at the Bottom of the Sidebar
 * Sprints Tracker, XP Level-up Engine, Pomodoro, Hydration, Calendar & Habits
 */
(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // DOM Elements - Stage & Pokémon
  const appContainer = document.getElementById('appContainer');
  const stageContainer = document.getElementById('stageContainer');
  const stageHabitat = document.getElementById('stageHabitat');
  const buddyTrack = document.getElementById('buddyTrack');
  const buddy = document.getElementById('buddy');
  const bubble = document.getElementById('bubble');
  const bubbleText = document.getElementById('bubbleText');
  const charNameBadge = document.getElementById('charNameBadge');
  const pokemonLevelBadge = document.getElementById('pokemonLevelBadge');
  const pokemonXpFill = document.getElementById('pokemonXpFill');
  const pokemonXpText = document.getElementById('pokemonXpText');
  const feedBerryBtn = document.getElementById('feedBerryBtn');
  const stageSleepBtn = document.getElementById('stageSleepBtn');
  const quickSwapBtn = document.getElementById('quickSwapBtn');

  // DOM Elements - Navigation Tabs & Panels
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanels = document.getElementById('tabPanels');

  // DOM Elements - Pomodoro
  const pomoPhaseBadge = document.getElementById('pomoPhaseBadge');
  const pomoPhaseDesc = document.getElementById('pomoPhaseDesc');
  const pomoClock = document.getElementById('pomoClock');
  const pomoRingProgress = document.getElementById('pomoRingProgress');
  const pomoRoundsVisual = document.getElementById('pomoRoundsVisual');
  const pomoStartBtn = document.getElementById('pomoStartBtn');
  const pomoResetBtn = document.getElementById('pomoResetBtn');
  const pomoChips = document.querySelectorAll('.chip');

  // DOM Elements - Water
  const waterGlassesRow = document.getElementById('waterGlassesRow');
  const waterDrankCount = document.getElementById('waterDrankCount');
  const waterNextMins = document.getElementById('waterNextMins');
  const waterGoalBadge = document.getElementById('waterGoalBadge');
  const logWaterBtn = document.getElementById('logWaterBtn');

  // DOM Elements - Sprint
  const sprintTitle = document.getElementById('sprintTitle');
  const sprintDates = document.getElementById('sprintDates');
  const sprintPercent = document.getElementById('sprintPercent');
  const sprintBarFill = document.getElementById('sprintBarFill');
  const taskInput = document.getElementById('taskInput');
  const taskPrioritySelect = document.getElementById('taskPrioritySelect');
  const addTaskBtn = document.getElementById('addTaskBtn');
  const tasksList = document.getElementById('tasksList');

  // DOM Elements - Calendar
  const calPrevMonth = document.getElementById('calPrevMonth');
  const calNextMonth = document.getElementById('calNextMonth');
  const calMonthTitle = document.getElementById('calMonthTitle');
  const calendarDaysGrid = document.getElementById('calendarDaysGrid');
  const calSelectedDayHeader = document.getElementById('calSelectedDayHeader');
  const calDayEventsList = document.getElementById('calDayEventsList');
  const calEventTitle = document.getElementById('calEventTitle');
  const calEventDate = document.getElementById('calEventDate');
  const calEventType = document.getElementById('calEventType');
  const addCalEventBtn = document.getElementById('addCalEventBtn');

  // DOM Elements - Habits
  const habitsList = document.getElementById('habitsList');

  // State Configuration
  const config = {
    scale: 2,
    reactToErrors: true,
    inactivityTimeoutSeconds: 60,
    character: 'pikachu',
    accessory: null,
    styleMode: 'pixel',
    waterIntervalMinutes: 45,
    customPicture: '',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  };

  // Pokémon Level & Trainer XP System
  let pokemonData = {
    character: 'pikachu',
    level: 1,
    xp: 25,
    xpNeeded: 100
  };

  let productivity = {
    sprintData: {
      name: 'Sprint 14: Core Features',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      tasks: [
        { id: '1', text: 'Set up Pokémon roaming engine', priority: 'high', status: 'done' },
        { id: '2', text: 'Connect sprint tasks to XP level-ups', priority: 'high', status: 'inprogress' },
        { id: '3', text: 'Drink water reminders & hydration goal', priority: 'medium', status: 'done' },
        { id: '4', text: 'Pomodoro deep focus countdown', priority: 'medium', status: 'inprogress' }
      ]
    },
    calendarEvents: [
      { id: '1', title: 'Sprint Kickoff & Planning', date: new Date().toISOString().split('T')[0], type: 'sprint' },
      { id: '2', title: 'Mid-Sprint Review', date: new Date(Date.now() + 6 * 86400000).toISOString().split('T')[0], type: 'meeting' },
      { id: '3', title: 'Sprint Retrospective', date: new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0], type: 'deadline' }
    ],
    habits: [
      { id: '1', name: 'Drink 8 Glasses of Water', icon: '💧', streak: 5, completedDays: [1, 2, 3, 4] },
      { id: '2', name: 'Focus Deep Work Session', icon: '💻', streak: 7, completedDays: [1, 2, 3, 4, 5] },
      { id: '3', name: 'Stretch & Posture Break', icon: '🧘', streak: 3, completedDays: [1, 2, 4] },
      { id: '4', name: 'Commit Clean Code', icon: '📦', streak: 6, completedDays: [1, 2, 3, 4, 5] }
    ],
    hydrationData: {
      glassesToday: 3,
      goal: 8,
      lastDrinkTime: Date.now()
    },
    pomodoroState: {
      mode: 'idle',
      timeLeft: 25 * 60,
      totalTime: 25 * 60,
      isRunning: false,
      round: 1,
      targetRounds: 4,
      presetIndex: 0
    }
  };

  // Calendar State
  let calDate = new Date();
  calDate.setDate(1);
  let selectedCalDayKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

  // =============================================================
  // Web Audio Synthesizer (Chiptune Sounds)
  // =============================================================
  let audioCtx = null;
  function playAudioTone(freq = 520, duration = 0.25) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
      osc.start();
      osc.stop(audioCtx.currentTime + duration);
    } catch {
      // Audio silent fallback
    }
  }

  // =============================================================
  // Dialogue & Speech Bubble
  // =============================================================
  function getCharDialogue(key) {
    const char = config.character || 'pikachu';
    const d = window.DIALOGUE && window.DIALOGUE[char];
    if (d && typeof d[key] === 'function') {
      return d[key]();
    }
    const defaultD = window.DIALOGUE && window.DIALOGUE.pikachu;
    if (defaultD && typeof defaultD[key] === 'function') {
      return defaultD[key]();
    }
    return '';
  }

  let speechTimer = null;
  function speak(text, duration = 4000) {
    if (!bubble || !bubbleText) return;
    clearTimeout(speechTimer);
    bubbleText.textContent = text;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('show', 'pop');
    speechTimer = setTimeout(() => {
      bubble.classList.remove('show');
    }, duration);
  }

  // =============================================================
  // Autonomous Roaming Engine (At the Bottom of the Sidebar)
  // =============================================================
  let buddyX = 20;
  let targetX = 20;
  let buddyDir = 1; // 1 = right, -1 = left
  let walkSpeed = 1.2;
  let isRoaming = true;
  let isDragging = false;
  let isEating = false;
  let idleTimer = null;
  let currentPose = 'idle';

  function getStageWidth() {
    if (stageHabitat && stageHabitat.clientWidth > 40) return stageHabitat.clientWidth;
    if (stageContainer && stageContainer.clientWidth > 40) return stageContainer.clientWidth;
    return window.innerWidth || 300;
  }

  function updateBuddyPosition() {
    if (!buddy) return;
    buddy.style.transform = `translateX(${buddyX}px)`;
    if (bubble) {
      const stageW = getStageWidth();
      const clampedBubbleX = Math.max(70, Math.min(stageW - 70, buddyX + 32));
      bubble.style.left = `${clampedBubbleX}px`;
    }
  }

  function setBuddyPose(pose, dir = buddyDir) {
    if (!buddy) return;
    currentPose = pose;
    buddy.className = `buddy ${pose} ${dir < 0 ? 'left' : ''}`;
  }

  function scheduleNextWander() {
    clearTimeout(idleTimer);
    if (!isRoaming || isDragging || isEating || productivity.pomodoroState.mode === 'work' || buddy.classList.contains('sleep')) {
      return;
    }

    const delay = 2200 + Math.random() * 4000;
    idleTimer = setTimeout(() => {
      if (!isRoaming || isDragging || isEating || productivity.pomodoroState.mode === 'work' || buddy.classList.contains('sleep')) {
        return;
      }
      const stageW = getStageWidth();
      const maxW = Math.max(10, stageW - 70);
      targetX = Math.floor(10 + Math.random() * maxW);
      scheduleNextWander();
    }, delay);
  }

  // Physics loop (continuous smooth animation along the bottom floor)
  function tick() {
    if (!isDragging && !isEating && isRoaming && productivity.pomodoroState.mode !== 'work' && !buddy.classList.contains('sleep')) {
      const dist = targetX - buddyX;
      if (Math.abs(dist) > 2) {
        buddyDir = dist > 0 ? 1 : -1;
        buddyX += buddyDir * walkSpeed;
        setBuddyPose('walk', buddyDir);
        updateBuddyPosition();
      } else {
        buddyX = targetX;
        updateBuddyPosition();
        if (currentPose === 'walk') {
          setBuddyPose('idle', buddyDir);
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  scheduleNextWander();

  window.addEventListener('resize', () => {
    const stageW = getStageWidth();
    if (buddyX > stageW - 75) {
      buddyX = Math.max(10, stageW - 75);
      targetX = buddyX;
      updateBuddyPosition();
    }
  });

  // =============================================================
  // Pokémon Rendering & Display Badges
  // =============================================================
  function getCharDisplayName() {
    if (window.POKEMON && window.POKEMON[config.character]) {
      return window.POKEMON[config.character].name;
    }
    if (window.CHARACTERS && window.CHARACTERS[config.character]) {
      return window.CHARACTERS[config.character].name;
    }
    return config.character.charAt(0).toUpperCase() + config.character.slice(1);
  }

  function updateBadgeName() {
    if (!charNameBadge) return;
    const poke = window.POKEMON && window.POKEMON[config.character];
    if (poke) {
      charNameBadge.textContent = `${poke.name} ${poke.type.split(' ')[1] || '⚡'}`;
    } else {
      charNameBadge.textContent = getCharDisplayName();
    }
  }

  function renderBuddy() {
    if (!buddy) return;
    const poke = window.POKEMON && window.POKEMON[config.character];
    if (poke) {
      const spriteUrl = window.getPokemonSprite(config.character);
      buddy.innerHTML = `
        <div class="pokemon-container">
          <img id="pokeSprite" class="pokemon-sprite" src="${spriteUrl}" alt="${poke.name}" />
          <div class="shadow-ellipse"></div>
        </div>
      `;
    } else if (config.character === 'custom' && config.customPicture) {
      buddy.innerHTML = `
        <div class="pokemon-container">
          <img id="pokeSprite" class="pokemon-sprite" src="${config.customPicture}" alt="Custom" />
          <div class="shadow-ellipse"></div>
        </div>
      `;
    } else {
      buddy.innerHTML = window.buddyMarkup(config.character, config.accessory);
    }
    updateBadgeName();
    updatePokemonXpUi();
  }

  // =============================================================
  // Pokémon Level & Trainer XP System
  // =============================================================
  function addPokemonXp(amount, reason = '') {
    pokemonData.xp += amount;
    showFloatingXp(amount);
    playAudioTone(784, 0.15);

    while (pokemonData.xp >= pokemonData.xpNeeded) {
      pokemonData.xp -= pokemonData.xpNeeded;
      pokemonData.level++;
      pokemonData.xpNeeded = pokemonData.level * 100;
      playAudioTone(1046, 0.4);
      speak(`🌟 Level Up! ${getCharDisplayName()} reached Lv. ${pokemonData.level}! ⚡`, 5000);
      triggerHappyJump();
    }

    updatePokemonXpUi();
    vscode.postMessage({
      command: 'savePokemonData',
      pokemonData: pokemonData
    });
  }

  function updatePokemonXpUi() {
    if (pokemonLevelBadge) {
      pokemonLevelBadge.textContent = `Lv. ${pokemonData.level}`;
    }
    if (pokemonXpFill) {
      const pct = Math.min(100, Math.round((pokemonData.xp / pokemonData.xpNeeded) * 100));
      pokemonXpFill.style.width = `${pct}%`;
    }
    if (pokemonXpText) {
      pokemonXpText.textContent = `${pokemonData.xp}/${pokemonData.xpNeeded} XP`;
    }
  }

  function showFloatingXp(amount) {
    if (!stageHabitat) return;
    const el = document.createElement('div');
    el.className = 'xp-float-particle';
    el.textContent = `+${amount} XP`;
    el.style.left = `${buddyX + 15}px`;
    el.style.bottom = '50px';
    stageHabitat.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  function triggerHappyJump() {
    if (!buddy) return;
    buddy.classList.remove('happy');
    void buddy.offsetWidth;
    buddy.classList.add('happy');
    setTimeout(() => {
      buddy.classList.remove('happy');
    }, 1200);
  }

  // =============================================================
  // Floor Berry Feeding
  // =============================================================
  function feedBerry(targetBerryX) {
    if (isEating) return;
    isEating = true;
    const stageW = getStageWidth();
    const berryX = targetBerryX !== undefined
      ? Math.max(10, Math.min(stageW - 35, targetBerryX))
      : Math.floor(Math.max(10, Math.min(stageW - 35, buddyX + (Math.random() > 0.5 ? 40 : -40))));

    const berryEl = document.createElement('div');
    berryEl.className = 'floor-berry';
    berryEl.textContent = '🍓';
    berryEl.style.left = `${berryX}px`;
    stageHabitat.appendChild(berryEl);

    targetX = Math.max(5, berryX - 15);
    walkSpeed = 2.4;
    setBuddyPose('run', targetX > buddyX ? 1 : -1);

    const checkArrival = setInterval(() => {
      if (Math.abs(buddyX - targetX) < 10) {
        clearInterval(checkArrival);
        walkSpeed = 1.2;
        berryEl.remove();
        setBuddyPose('happy');
        addPokemonXp(5, 'Fed Berry');
        const cry = getCharDialogue('berry') || 'Nom nom nom! Delicious berry! 🍓';
        speak(cry, 3000);
        setTimeout(() => {
          isEating = false;
          setBuddyPose('idle');
          scheduleNextWander();
        }, 1800);
      }
    }, 60);
  }

  if (feedBerryBtn) {
    feedBerryBtn.addEventListener('click', () => {
      feedBerry();
    });
  }

  if (stageContainer) {
    stageContainer.addEventListener('click', e => {
      if (e.target.closest('#stageOverlay') || e.target.closest('#bubble') || e.target.closest('#buddy')) {
        return;
      }
      const rect = stageContainer.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      feedBerry(clickX - 25);
    });
  }

  if (buddy) {
    buddy.addEventListener('click', e => {
      e.stopPropagation();
      if (buddy.classList.contains('sleep')) {
        buddy.classList.remove('sleep');
        speak(getCharDialogue('welcome') || 'Awake and ready! ⚡');
        scheduleNextWander();
        return;
      }
      triggerHappyJump();
      playAudioTone(880, 0.2);
      speak(getCharDialogue('pet') || 'Pikachuuu! ✨💖', 3000);
    });
  }

  if (stageSleepBtn) {
    stageSleepBtn.addEventListener('click', () => {
      const isSleeping = buddy.classList.contains('sleep');
      if (isSleeping) {
        buddy.classList.remove('sleep');
        speak(getCharDialogue('welcome') || 'Awake and training! ⚡');
        scheduleNextWander();
      } else {
        buddy.classList.add('sleep');
        speak(getCharDialogue('sleepy') || 'Resting... zzz... 💤');
        clearTimeout(idleTimer);
      }
    });
  }

  if (quickSwapBtn) {
    quickSwapBtn.addEventListener('click', () => {
      const pokeKeys = Object.keys(window.POKEMON || {});
      if (pokeKeys.length === 0) return;
      const curIdx = pokeKeys.indexOf(config.character);
      const nextIdx = (curIdx + 1) % pokeKeys.length;
      const nextChar = pokeKeys[nextIdx];
      config.character = nextChar;
      pokemonData.character = nextChar;
      document.querySelectorAll('.pokemon-tile').forEach(t => {
        t.classList.toggle('active', t.dataset.char === nextChar);
      });
      renderBuddy();
      const cry = getCharDialogue('welcome');
      speak(cry, 3500);
      vscode.postMessage({ command: 'setCharacter', character: nextChar });
      vscode.postMessage({ command: 'savePokemonData', pokemonData });
    });
  }

  // =============================================================
  // Sprints & Task Management (Tied to XP Gain)
  // =============================================================
  function renderSprint() {
    const sp = productivity.sprintData;
    if (sprintTitle) sprintTitle.textContent = sp.name;
    if (sprintDates) sprintDates.textContent = `${sp.startDate} ~ ${sp.endDate}`;

    const total = sp.tasks.length;
    const done = sp.tasks.filter(t => t.status === 'done').length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    if (sprintPercent) sprintPercent.textContent = `${pct}% Complete (${done}/${total})`;
    if (sprintBarFill) sprintBarFill.style.width = `${pct}%`;

    if (tasksList) {
      tasksList.innerHTML = '';
      sp.tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-item ${task.status}`;

        const dot = document.createElement('span');
        dot.className = 'task-priority-dot';
        dot.textContent = task.priority === 'high' ? '🔴' : (task.priority === 'low' ? '⚪' : '🟡');

        const check = document.createElement('span');
        check.className = 'task-check';
        check.textContent = task.status === 'done' ? '☑' : (task.status === 'inprogress' ? '⏳' : '☐');

        const txt = document.createElement('span');
        txt.className = 'task-text';
        txt.textContent = task.text;

        const del = document.createElement('button');
        del.className = 'del-btn';
        del.textContent = '✕';
        del.title = 'Delete Task';
        del.addEventListener('click', e => {
          e.stopPropagation();
          productivity.sprintData.tasks = productivity.sprintData.tasks.filter(t => t.id !== task.id);
          renderSprint();
          vscode.postMessage({ command: 'updateSprint', sprintData: productivity.sprintData });
        });

        li.appendChild(dot);
        li.appendChild(check);
        li.appendChild(txt);
        li.appendChild(del);

        li.addEventListener('click', () => {
          if (task.status === 'done') {
            task.status = 'todo';
          } else {
            task.status = 'done';
            setBuddyPose('happy');
            playAudioTone(784, 0.3);
            addPokemonXp(25, 'Sprint Task');
            const cry = getCharDialogue('taskDone') || 'Task complete! +25 XP! 🌟';
            speak(cry, 4000);
          }
          renderSprint();
          vscode.postMessage({ command: 'updateSprint', sprintData: productivity.sprintData });
        });

        tasksList.appendChild(li);
      });
    }
  }

  if (addTaskBtn && taskInput) {
    const handleAddTask = () => {
      const text = taskInput.value.trim();
      if (!text) return;
      const priority = taskPrioritySelect ? taskPrioritySelect.value : 'medium';
      productivity.sprintData.tasks.push({
        id: String(Date.now()),
        text,
        priority,
        status: 'todo'
      });
      taskInput.value = '';
      renderSprint();
      playAudioTone(659, 0.2);
      speak(`New sprint task added! Let's crush it! 🚀`, 3000);
      vscode.postMessage({ command: 'updateSprint', sprintData: productivity.sprintData });
    };

    addTaskBtn.addEventListener('click', handleAddTask);
    taskInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') handleAddTask();
    });
  }

  // =============================================================
  // Pomodoro Focus Engine
  // =============================================================
  function renderPomodoro() {
    const state = productivity.pomodoroState;
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

    if (pomoClock) pomoClock.textContent = timeStr;

    if (pomoPhaseBadge) {
      pomoPhaseBadge.textContent = state.mode === 'work' ? 'FOCUS TIME' : (state.mode === 'break' ? 'BREAK TIME' : 'POMODORO');
      pomoPhaseBadge.className = `badge ${state.mode === 'work' ? 'work' : (state.mode === 'break' ? 'break' : '')}`;
    }

    if (pomoPhaseDesc) {
      pomoPhaseDesc.textContent = state.mode === 'work'
        ? `I'll train beside you 🍅 (Round ${state.round}/${state.targetRounds})`
        : (state.mode === 'break' ? 'Stretch, hydrate, and relax ☕' : 'Ready for training session 🍅');
    }

    if (pomoStartBtn) {
      pomoStartBtn.textContent = state.isRunning ? 'Pause' : 'Start Focus';
      pomoStartBtn.className = `btn ${state.isRunning ? 'secondary' : 'primary glow'}`;
    }

    if (pomoRingProgress) {
      const total = state.totalTime || (25 * 60);
      const frac = Math.max(0, Math.min(1, state.timeLeft / total));
      const circumference = 2 * Math.PI * 76; // r=76 -> ~477.5
      pomoRingProgress.style.strokeDashoffset = `${circumference * (1 - frac)}`;
    }

    if (pomoRoundsVisual) {
      pomoRoundsVisual.innerHTML = '';
      for (let i = 1; i <= state.targetRounds; i++) {
        const dot = document.createElement('span');
        dot.className = `round-dot ${i <= state.round ? 'active' : ''}`;
        pomoRoundsVisual.appendChild(dot);
      }
    }
  }

  if (pomoStartBtn) {
    pomoStartBtn.addEventListener('click', () => {
      playAudioTone(523, 0.3);
      vscode.postMessage({ command: 'togglePomodoro' });
    });
  }

  if (pomoResetBtn) {
    pomoResetBtn.addEventListener('click', () => {
      vscode.postMessage({ command: 'resetPomodoro' });
    });
  }

  pomoChips.forEach(chip => {
    chip.addEventListener('click', () => {
      pomoChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const work = parseInt(chip.dataset.pomo, 10);
      const brk = parseInt(chip.dataset.break, 10);
      vscode.postMessage({ command: 'setPomoPreset', work, break: brk });
    });
  });

  // =============================================================
  // Hydration & Water Engine
  // =============================================================
  function renderHydration() {
    const hyd = productivity.hydrationData;
    if (waterDrankCount) waterDrankCount.textContent = hyd.glassesToday;
    if (waterGoalBadge) waterGoalBadge.textContent = `Goal: ${hyd.goal} Glasses`;

    const elapsedMins = (Date.now() - hyd.lastDrinkTime) / 60000;
    const remain = Math.max(0, Math.round(config.waterIntervalMinutes - elapsedMins));
    if (waterNextMins) waterNextMins.textContent = `${remain}m`;

    if (waterGlassesRow) {
      waterGlassesRow.innerHTML = '';
      for (let i = 1; i <= hyd.goal; i++) {
        const glass = document.createElement('button');
        glass.className = `glass-item ${i <= hyd.glassesToday ? 'filled' : ''}`;
        glass.innerHTML = `<span>💧</span>`;
        glass.title = `Glass ${i}`;
        glass.addEventListener('click', () => {
          hyd.glassesToday = i;
          hyd.lastDrinkTime = Date.now();
          renderHydration();
          playAudioTone(880, 0.25);
          speak(getCharDialogue('water') || 'Hydration boost! Drink up! 💧');
          addPokemonXp(10, 'Hydration');
          vscode.postMessage({ command: 'logWater' });
        });
        waterGlassesRow.appendChild(glass);
      }
    }
  }

  if (logWaterBtn) {
    logWaterBtn.addEventListener('click', () => {
      playAudioTone(880, 0.25);
      triggerHappyJump();
      speak(getCharDialogue('water') || 'Slurp! Stay hydrated! 💧');
      addPokemonXp(10, 'Hydration');
      vscode.postMessage({ command: 'logWater' });
    });
  }

  // =============================================================
  // Calendar Grid & Deadlines
  // =============================================================
  function renderCalendar() {
    const year = calDate.getFullYear();
    const month = calDate.getMonth();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (calMonthTitle) calMonthTitle.textContent = `${monthNames[month]} ${year}`;

    const firstDay = new Date(year, month, 1);
    const dayOfWeek = (firstDay.getDay() + 6) % 7;
    const startDate = new Date(year, month, 1 - dayOfWeek);
    const todayStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;

    if (calendarDaysGrid) {
      calendarDaysGrid.innerHTML = '';
      for (let i = 0; i < 42; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        const dayKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const cell = document.createElement('div');
        cell.className = `cal-cell ${d.getMonth() !== month ? 'dim' : ''} ${dayKey === todayStr ? 'today' : ''} ${dayKey === selectedCalDayKey ? 'selected' : ''}`;
        cell.textContent = d.getDate();

        const dayEvents = productivity.calendarEvents.filter(ev => ev.date === dayKey);
        if (dayEvents.length > 0) {
          const dots = document.createElement('div');
          dots.className = 'cal-dots';
          dayEvents.slice(0, 3).forEach(ev => {
            const dot = document.createElement('span');
            dot.className = `cal-dot ${ev.type}`;
            dots.appendChild(dot);
          });
          cell.appendChild(dots);
        }

        cell.addEventListener('click', () => {
          selectedCalDayKey = dayKey;
          renderCalendar();
        });

        calendarDaysGrid.appendChild(cell);
      }
    }

    if (calSelectedDayHeader) calSelectedDayHeader.textContent = `Events on ${selectedCalDayKey}`;
    if (calDayEventsList) {
      calDayEventsList.innerHTML = '';
      const dayEvents = productivity.calendarEvents.filter(ev => ev.date === selectedCalDayKey);
      if (dayEvents.length === 0) {
        calDayEventsList.innerHTML = '<span class="subtext">No events on this day</span>';
      } else {
        dayEvents.forEach(ev => {
          const item = document.createElement('div');
          item.className = `day-ev-item ${ev.type}`;
          item.innerHTML = `<strong>${ev.title}</strong> <span class="badge">${ev.type}</span>`;
          calDayEventsList.appendChild(item);
        });
      }
    }
  }

  if (calPrevMonth) {
    calPrevMonth.addEventListener('click', () => {
      calDate.setMonth(calDate.getMonth() - 1);
      renderCalendar();
    });
  }

  if (calNextMonth) {
    calNextMonth.addEventListener('click', () => {
      calDate.setMonth(calDate.getMonth() + 1);
      renderCalendar();
    });
  }

  if (addCalEventBtn && calEventTitle && calEventDate && calEventType) {
    addCalEventBtn.addEventListener('click', () => {
      const title = calEventTitle.value.trim();
      const date = calEventDate.value;
      const type = calEventType.value;
      if (!title || !date) return;
      productivity.calendarEvents.push({ id: String(Date.now()), title, date, type });
      calEventTitle.value = '';
      renderCalendar();
      speak(`Milestone "${title}" added to calendar! 📅`);
      vscode.postMessage({ command: 'updateCalendar', calendarEvents: productivity.calendarEvents });
    });
  }

  // =============================================================
  // Habits Tracking
  // =============================================================
  function renderHabits() {
    if (!habitsList) return;
    habitsList.innerHTML = '';
    productivity.habits.forEach(h => {
      const li = document.createElement('li');
      li.className = 'habit-row';

      const info = document.createElement('div');
      info.className = 'habit-info';
      info.innerHTML = `<span>${h.icon}</span> <strong>${h.name}</strong> <span class="badge">🔥 ${h.streak}d streak</span>`;

      const days = document.createElement('div');
      days.className = 'habit-days';
      const todayDay = new Date().getDay();
      for (let d = 0; d < 7; d++) {
        const dayDot = document.createElement('button');
        dayDot.className = `habit-day-dot ${h.completedDays.includes(d) ? 'done' : ''} ${d === todayDay ? 'today' : ''}`;
        dayDot.title = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d];
        dayDot.addEventListener('click', () => {
          if (h.completedDays.includes(d)) {
            h.completedDays = h.completedDays.filter(x => x !== d);
          } else {
            h.completedDays.push(d);
            playAudioTone(880, 0.2);
            triggerHappyJump();
            speak(`Habit streak boosted! Keep going! ⭐`);
            addPokemonXp(10, 'Habit');
          }
          renderHabits();
          vscode.postMessage({ command: 'updateHabits', habits: productivity.habits });
        });
        days.appendChild(dayDot);
      }

      li.appendChild(info);
      li.appendChild(days);
      habitsList.appendChild(li);
    });
  }

  // =============================================================
  // Navigation Tabs Switching
  // =============================================================
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`${tab.dataset.tab}Panel`);
      if (panel) panel.classList.add('active');
    });
  });

  // =============================================================
  // Pokémon Selection Tiles
  // =============================================================
  document.querySelectorAll('.pokemon-tile, .char-tile').forEach(tile => {
    tile.addEventListener('click', () => {
      const char = tile.dataset.char;
      if (!char) return;
      document.querySelectorAll('.pokemon-tile, .char-tile').forEach(t => t.classList.remove('active'));
      tile.classList.add('active');
      config.character = char;
      pokemonData.character = char;
      renderBuddy();
      const cry = getCharDialogue('welcome') || 'Pika-pi! Let’s crush this sprint! ⚡';
      speak(cry, 3500);
      vscode.postMessage({ command: 'setCharacter', character: char });
      vscode.postMessage({ command: 'savePokemonData', pokemonData });
    });
  });

  // =============================================================
  // VS Code Message Handling
  // =============================================================
  window.addEventListener('message', event => {
    const msg = event.data;
    if (!msg) return;

    switch (msg.type) {
      case 'config':
        if (msg.config) {
          config.character = msg.config.character || 'pikachu';
          config.accessory = msg.config.accessory || null;
          config.styleMode = msg.config.styleMode || 'pixel';
          config.waterIntervalMinutes = msg.config.waterIntervalMinutes || 45;
          config.customPicture = msg.config.customPicture || '';

          pokemonData.character = config.character;
          document.querySelectorAll('.pokemon-tile').forEach(c => {
            c.classList.toggle('active', c.dataset.char === config.character);
          });

          renderBuddy();
        }
        break;

      case 'productivitySync':
        if (msg.sprintData) productivity.sprintData = msg.sprintData;
        if (msg.calendarEvents) productivity.calendarEvents = msg.calendarEvents;
        if (msg.habits) productivity.habits = msg.habits;
        if (msg.hydrationData) productivity.hydrationData = msg.hydrationData;
        if (msg.pomodoroState) productivity.pomodoroState = msg.pomodoroState;
        if (msg.pokemonData) {
          pokemonData = msg.pokemonData;
          if (pokemonData.character && pokemonData.character !== config.character) {
            config.character = pokemonData.character;
          }
        }

        renderSprint();
        renderPomodoro();
        renderHydration();
        renderCalendar();
        renderHabits();
        renderBuddy();
        break;

      case 'waterAlert':
        playAudioTone(880, 0.35);
        triggerHappyJump();
        speak(getCharDialogue('water') || 'Drink Water! Stay hydrated! 💧', 6000);
        break;

      case 'pomodoroAlert':
        playAudioTone(784, 0.4);
        triggerHappyJump();
        addPokemonXp(50, 'Pomodoro Session');
        speak(msg.message || 'Victory! Focus session completed! +50 XP! 🏆', 6000);
        break;

      case 'celebrate':
        triggerHappyJump();
        addPokemonXp(25, 'Celebration');
        playAudioTone(784, 0.3);
        speak(getCharDialogue('completed') || 'Superhit work! 🏆');
        break;

      case 'toggleSleep':
        if (stageSleepBtn) stageSleepBtn.click();
        break;

      case 'typing':
        if (productivity.pomodoroState.mode !== 'work' && !buddy.classList.contains('sleep')) {
          walkSpeed = msg.intensity >= 2 ? 2.6 : 1.8;
          setBuddyPose('run');
          setTimeout(() => {
            walkSpeed = 1.2;
            if (!productivity.pomodoroState.isRunning) setBuddyPose('idle');
          }, 1200);
        }
        break;
    }
  });

  // Initial Render Call
  renderBuddy();
  renderSprint();
  renderPomodoro();
  renderHydration();
  renderCalendar();
  renderHabits();

  // Initial greeting
  setTimeout(() => {
    speak(getCharDialogue('welcome') || 'Pika-pi! Let’s crush this sprint! ⚡');
  }, 600);

  vscode.postMessage({ command: 'ready' });
})();
