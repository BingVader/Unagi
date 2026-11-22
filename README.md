# Desktop Companion & Developer Productivity Suite for VS Code

A complete, production-ready Visual Studio Code extension that brings the productivity tools and animated companion from the desktop app directly into your editor.

![VS Code Companion](media/companion-icon.svg)

---

## 🚀 Key Features

### 1. 🍅 Pomodoro Clock & Focus Cycles
- **Presets**: 25m Focus (5m break), 50m Deep Focus (10m break), 15m Sprint (3m break), and 1m quick demo.
- **Rounds Visual**: 4-round cycle tracking with visual dot indicators.
- **Companion States**: The companion sits quietly beside you during **Focus** time, stretches with you during **Break** time, and celebrates upon completion.
- **Status Bar Integration**: Live countdown and mode indicator in the VS Code status bar (`$(clock) 24:59 [Focus]`).
- **Audio Chimes**: Gentle Web Audio API synthesizer chimes at session transitions.

### 2. 💧 Hydration Tracker & Drink Water Reminders
- **Periodic Alerts**: Configurable reminder interval (default 45 minutes) via VS Code toast notifications and buddy speech bubbles.
- **Interactive Glasses**: 8-glass daily progress row with click-to-log animation.
- **1-Click Logger**: Quick logging via "+1 Glass" button, status bar item, or command palette (`companion.logWater`).
- **Goal Tracking**: Shows glasses drank vs daily goal (default 8 glasses).

### 3. 🏃 Sprints & Task Tracker
- **Sprint Goals**: Tracks current sprint name and date boundaries.
- **Dynamic Progress Bar**: Auto-calculates completion percentage as tasks are toggled.
- **Interactive Checklist**: Tasks with priority tags (🔴 High, 🟡 Medium, ⚪ Low) and states (☐ Todo → ⏳ In Progress → ☑ Done).
- **Celebration Reaction**: Completing tasks triggers celebration animations and dialogue.

### 4. 📅 6-Week Interactive Calendar
- **Full Month Grid**: 42-day 6-week layout with previous/next month navigation.
- **Categorized Milestones**: Track Sprints, Deadlines, Meetings, and Milestones with colored dots.
- **Selected Day Inspector**: Click any calendar day to inspect and add scheduled events.

### 5. ⭐ Habits Tracker & Streaks
- **Daily Habits**: Track habits such as drinking water, deep work focus, posture stretching, and reading documentation.
- **Weekly Checkboxes**: Mon–Sun completion indicators with running streak counters (🔥 7d).

### 6. 🎭 Meme & Cultural Characters
- **Mohanlal (Lalettan)**: Signature tilted shoulder swagger walk, aviator Ray-Bans, curled moustache, and iconic Malayalam dialogue (*"Po mone Dinesha, let's get to work! 🕶️"*).
- **CJ (Carl Johnson - GTA San Andreas)**: White tank top, blue jeans, sneakers, West Coast swagger, and classic dialogue (*"Ah shit, here we go again. Focus time! 🍅"*).
- **Cute Dog**: Desktop companion dog with wagging tail and happy jump reactions.
- **Cartoon Cat (Tom)**: Gray cartoon cat with whisker bobs and catnap stretches.
- **Hero Kid**: Ben 10 style hero ready for sprint missions.
- **Ranger Hero**: Red Power Ranger on productivity watch.
- **Doge (Shiba Inu)**: Classic meme icon (*"Much code, very developer, such wow! 🐕"*).
- **Pepe the Frog**: Expressive meme reactions (*"Feels good man. Ready to code. 🐸"*).
- **Chill Capybara**: Ultra-calm capybara with signature yuzu fruit on head (*"Okay I pull up. Super chill coding today. 🍊"*).
- **Custom Picture Upload**: Upload any personal image or avatar (PNG, JPG, GIF, WebP, SVG).

### 7. 🕹️ Dual Visual Styles
- **🕹️ Pixelated Mode**: Retro 16-bit crisp pixel art rendering with sharp edges.
- **✨ HD / Smooth Vector Mode**: Clean, high-definition smooth vector illustrations.

### 8. 👑 Wearable Accessories
- Customize any character with accessories anchored to their head:
  - 🥳 Party Hat
  - 👑 Royal Crown
  - 🧙 Wizard Hat
  - ⭐ Golden Star
  - 🌸 Sakura Flower
  - 🎀 Red Bow
  - 😇 Angel Halo
  - 🎅 Santa Hat

### 9. 💬 Speech Bubble & VS Code Event Reactivity
- **Interactive Speech Bubble**: Event-driven dialogues tailored to each character.
- **Typing Activity**: Companion walks or runs proportional to typing burst intensity in your code.
- **File Saves**: Triggers celebratory jump animations.
- **Diagnostic Errors**: Companion reacts when active editor error count increases.
- **Terminal Task Process**: Reacts to build results (success celebration vs error concern).
- **Petting**: Click directly on your companion to give them a pet and trigger a happy reaction.

### 10. 🖥️ Multiple View Modes
- **Sidebar Activity Bar**: Compact view in the custom Companion activity bar icon.
- **Bottom Panel View**: Dockable alongside Terminal, Output, and Problems.
- **Explorer View**: Accessible from the Explorer tree.
- **Full-Page Dashboard**: Run `companion.openFullPage` (or click ⤢) to open the full editor tab dashboard.

---

## ⌨️ Commands

| Command | Title |
|---|---|
| `companion.focus` | Focus Companion Sidebar View |
| `companion.openFullPage` | Open Full Page Productivity Dashboard |
| `companion.startPomodoro` | Start / Pause Pomodoro Timer |
| `companion.logWater` | Log Glass of Water (+1) |
| `companion.selectCharacter` | Choose Character (Mohanlal, CJ, Doge, etc.) |
| `companion.uploadPicture` | Upload Custom Picture / Avatar |
| `companion.toggleSleep` | Toggle Sleep Mode |
| `companion.triggerCelebrate` | Trigger Celebration Animation |

---

## ⚙️ Extension Settings

- `companion.character`: Select companion model (`mohanlal`, `cj`, `dog`, `tom`, `hero`, `ranger`, `doge`, `pepe`, `capybara`, `custom`).
- `companion.accessory`: Choose wearable accessory (`party-hat`, `crown`, `wizard`, `star`, `flower`, `bow`, `halo`, `santa`, or `null`).
- `companion.styleMode`: Rendering style (`pixel` or `hd`).
- `companion.pomodoroFocusMinutes`: Focus session length (default: 25).
- `companion.pomodoroBreakMinutes`: Break duration (default: 5).
- `companion.waterIntervalMinutes`: Hydration reminder interval in minutes (default: 45).
- `companion.waterDailyGoal`: Daily hydration goal in glasses (default: 8).
- `companion.scale`: Pixel scale multiplier (1 to 4).
- `companion.reactToErrors`: Toggle reactions to diagnostic errors (default: true).
- `companion.inactivityTimeoutSeconds`: Inactivity seconds before falling asleep (default: 60).

---

## 🛠️ Development & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Compile TypeScript**:
   ```bash
   npm run compile
   ```

3. **Launch in VS Code**:
   - Press `F5` in VS Code to open an **Extension Development Host** window.
   - Click the Companion icon in the Activity Bar or press `Ctrl+Shift+P` / `Cmd+Shift+P` and run **Pixel Companion: Open Full Page (Dashboard)**.
