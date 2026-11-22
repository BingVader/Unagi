# UNAGI ⚡

> *"Unagi is a state of total awareness. Only by achieving true Unagi can you be prepared for any danger that may befall you."*

**UNAGI** is a sleek, distraction-free productivity companion built directly into Visual Studio Code. It keeps you in a state of total awareness by tracking your active **Sprints**, **Task Checklists**, **Pending Reminders**, **Scratchpad Notes**, and **Deep Work Focus Timer** without leaving your editor.

---

## ⚡ Key Features

### 1. 🕒 Real-Time Clock & Header
- **Live Digital Clock**: Real-time `HH:MM:SS AM/PM` digital time display and date ticker (`Sun, Nov 22, 2026`) pinned at the top.
- **Timer Countdown Pill**: Displays your active focus/break countdown timer right in the header for glanceable awareness.

### 2. 🏃 Sprints & Interactive Task Checklists
- **Sprint Goals & Progress**: Track your active sprint title and duration dates with an auto-updating percentage progress bar (`75% Complete (3/4)`).
- **One-Click Checklist**: Toggle task status seamlessly:
  - `☐ Todo` ➔ `⏳ In Progress` ➔ `☑ Done` (strikes through completed tasks).
- **Priority Indicators**: Categorize tasks by urgency (`🔴 High`, `🟡 Medium`, `🟢 Low`).
- **Fast Task Input**: Quick input box with priority selector and Enter-key submission.
- **Filter Chips**: Filter task views instantly: `All`, `Pending`, or `Completed`.
- **Task Deletion**: Easy one-click deletion (`✕`).

### 3. ⚠️ Task Reminders & Deadline Alerts
- **Visual Alert Banner**: Automatically flags high-priority pending sprint tasks at the top of your checklist.
- **Periodic Background Reminders**: Configurable background notification reminders alert you when high-priority tasks are waiting for your attention, complete with a one-click button to open UNAGI.

### 4. 📝 Scratchpad Notes
- **Instant Developer Notepad**: A dedicated scratchpad for jotting down ideas, code snippets, meeting logs, and quick thoughts.
- **Continuous Auto-Save**: Automatically persists notes to VS Code storage as you type (no save button needed).
- **Formatting Quick Tools**: One-click insertions for:
  - `[ ] Task` — Checkbox list item
  - `• Bullet` — Bulleted list item
  - `Code` — Formatted TypeScript/code block
  - `## Heading` — Markdown heading
- **Copy & Clear**: Quick `📋 Copy to Clipboard` button and `✕ Clear` action.
- **Live Word & Character Counter**: Tracks text volume in real time.

### 5. ⏱️ Focus Clock & Deep Flow Timer
- **Large Digital Countdown**: Clean, modern digital timer display designed for deep work flow.
- **Smart Session Cycling**: Automatically cycles between **Focus Sessions** and **Break Times** with audio chimes and completion alerts.
- **Quick Presets**:
  - `⚡ 25m Unagi Focus` (Standard flow session)
  - `🧠 50m Deep Flow` (Extended deep work session)
  - `🏃 15m Sprint` (Rapid bug-fix or triage sprint)
  - `☕ 5m Break` (Mindful rest and stretch)
- **Status Bar Integration**: Live timer and task progress display in the VS Code status bar (`⚡ UNAGI: $(play) 25:00 | $(checklist) 3/4`).

---

## ⌨️ Commands

Access these commands anytime from the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Title | Description |
|---|---|---|
| `unagi.focus` | `UNAGI: Open Sprints, Notes & Timer` | Opens and focuses the UNAGI sidebar view. |
| `unagi.addTask` | `UNAGI: Quick Add Sprint Task` | Quickly adds a sprint task with priority from the command prompt. |
| `unagi.toggleTimer` | `UNAGI: Start / Pause Focus Timer` | Starts or pauses the active focus countdown timer. |

---

## ⚙️ Extension Settings

Configure UNAGI to match your preferred working rhythm in VS Code Settings (`Ctrl+,` / `Cmd+,` ➔ search `UNAGI`):

- `unagi.focusMinutes` *(number, default: `25`)*: Default focus timer duration in minutes.
- `unagi.reminderIntervalMinutes` *(number, default: `30`)*: Interval (in minutes) for checking and notifying about pending high-priority sprint tasks.
- `unagi.enableTaskReminders` *(boolean, default: `true`)*: Toggle periodic notification reminders for pending tasks.

---

## 🛠️ Development & Building

To run and debug the extension locally:

1. Clone or open the repository folder in VS Code.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile TypeScript:
   ```bash
   npm run compile
   ```
4. Press **`F5`** to launch the **Extension Development Host**.
5. Click the **UNAGI (⚡)** icon in the Activity Bar to achieve total awareness!
