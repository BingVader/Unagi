# UNAGI ⚡

> *"Unagi is a state of total awareness. Only by achieving true Unagi can you be prepared for any danger that may befall you."*

<img width="1536" height="1024" alt="Kerala Unagi_ Code, Chai, and Cool Vibes" src="https://github.com/user-attachments/assets/9fb6588e-465d-40cd-9220-a09493c87cce" />


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
- **Multiple Sprints, two types**: Keep **🏡 Personal** and **💼 Work** sprints side by side and switch between them with the sprint tabs (`＋ Sprint` creates one; rename or delete from the sprint card).
- **🔁 Daily repeating sprints**: Turn on *Repeats daily* and the sprint starts over every morning: all tasks go back to *To do*, and a 🔥 streak counts consecutive days you finished everything. Your companion announces the fresh day.

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

### 6. 🐸 Roaming Companion
- **A character that lives in UNAGI**: your companion wanders the whole UNAGI view, perching on cards, tabs and the header. Choose who it is (see **Characters** below); Croagunk is the default.
- **Delivers your alerts**: Walks to the relevant spot and speaks up for high-priority reminders, sprint deadlines (≤ 2 days left), and focus/break completion. Click an alert bubble to jump to the right tab.
- **Reacts to your tasks**: Celebrates completed tasks and acknowledges new ones.
- **Landing**: Drop it from mid-air and it falls, then plays its *land* animation the moment it touches the floor (characters with fall/land animations).
- **Water reminder**: Turn the 💧 reminder on or off and choose the interval (Focus Clock tab, or `unagi.water.*` settings). The companion speaks up and a notification appears.
- **Random quotes**: Every so often (default 45 min) it shares a quote from people, books and more. Fresh quotes come from the free [ZenQuotes.io](https://zenquotes.io) API (batches of 50, so it stays well under their rate limit), with DummyJSON as a backup and a built-in list when you're offline. No free quote API is truly unlimited, so this pooling keeps it effectively endless. Tune with `unagi.quotes.*`, or run `UNAGI: Say a Random Quote`. Turn `unagi.quotes.online` off to never contact the web.
- **Customizable dialogue**: In the Companion tab, edit what it says for every situation (greeting, petting, task added/completed, sprint completed, high-priority reminder, sprint ending, water reminder, focus/break finished, new day). Add several lines per scenario and it picks one at random. Placeholders such as `{sprint}`, `{t}`, `{n}` are filled in; *Preview* plays it, *Reset* restores the character's defaults. Dialogue is saved per character.
- **Interactive**: Click to pet, drag to carry. Respects `prefers-reduced-motion`.
- **Need more room?** Run `UNAGI: Open in Editor Tab` to give the companion a full editor-sized area to roam.

> VS Code doesn't let extensions draw outside their own views, so this in-view companion roams within UNAGI's sidebar or editor tab. For the whole screen, turn on the Desktop Companion below.

#### 🧭 Movement
Open the **🐸 Companion** tab in the sidebar and pick how your companion moves (or set `unagi.companion.movement`). It applies to both the in-view and the desktop companion:
- **Walk on floor**: walks left and right along the floor (the bottom of the view, or of your screen), like a character in a side-scrolling game. Pick it up and let go and it drops back to the floor. Alerts make it walk to the spot under whatever it is talking about.
- **Roam everywhere**: wanders across the whole view or screen, up onto cards and tabs.

#### 🎭 Characters
Pick one in the **🐸 Companion** tab of the sidebar: a card grid that refits itself from a very narrow sidebar up to a wide editor tab, with a switch to show or hide the companion, a **Create one from a photo** button, and a ✕ on each of your own characters. (Or run `UNAGI: Choose Companion Character`.) It applies to both the in-view and the desktop companion, and each character speaks in its own words.
- **Croagunk** (built in): drawn in code.
- **Kurta Guy**: a full sprite character with walk, alert, angry, happy, held, fall and land animations.
- **Your own, from pictures**: click **Create one from a photo** in the sidebar (or run `UNAGI: Create Custom Character from a Photo`). The studio first asks how many images you have:
  - **Just one image**: it bobs, sways, hops and shakes (*puppet* motion) for walking, alerts and celebrations.
  - **Several images**: give each reaction its own picture, like Kurta Guy: *Idle* (required), *Walking*, *Alert*, *Angry*, *Happy*, *Carried*, *Falling* and *Landing*. Each can be a single image, several images (used as frames, in filename order), or an animated GIF/WebP, which is converted to a smooth ~12 fps animation. Anything you skip gets automatic puppet motion from your Idle image. Use the same size and framing for all your images for the best result, and tell the studio which way your pictures face.

  Either way you can remove a plain background (with an adjustable tolerance), trim empty space, set the size and preview every reaction before saving. For a clean cut-out, use PNGs that already have a transparent background. Everything is processed locally, saved in VS Code's per-user storage (it survives extension updates), and never uploaded anywhere. Remove a character with the ✕ in the sidebar or `UNAGI: Delete a Custom Character`.
- **Adding a sprite character (developers)**: create `media/sprites/<id>/` with a `character.json` (name, display height, and which source animation file plays for each of `idle`, `walk`, `alert`, `angry`, `happy`, `drag`, `fall`, `land`; see `media/sprites/kurta`) and your animated WebP/GIF/PNG files, then run `npm run sprites` (Windows). That converts them into small PNG strips plus an `atlas.json`, which both companions play. Only `idle` is required; missing animations fall back gracefully.

#### 🖥️ Desktop Companion (Windows)
Run `UNAGI: Toggle Desktop Companion` (or set `unagi.desktopCompanion.enabled`) and your companion leaves the sidebar to roam your **entire screen**, including on top of VS Code and other apps, walking along the taskbar or anywhere else. Alerts make him run over beside your cursor and speak up.
- **Interact:** click to pet, drag to carry, click a bubble to open UNAGI, right-click for a menu (Open UNAGI / Hide).
- **Very lightweight:** a ~24 KB native helper, ~25 MB RAM, ~0.05% CPU when idle and about 1% of one core while walking. Frames are drawn once and cached, and it redraws only when something changes (about 20 fps moving, 3 fps idle, 1.5 fps asleep).
- **Nothing to install:** the helper is compiled once on first use with the `csc.exe` built into Windows (.NET Framework 4). It quits automatically if VS Code closes.
- **How it's built:** the helper's source lives in this repo (`helper/UnagiPet.cs`) and ships inside the extension, but at runtime it is a separate small process that talks to VS Code over a pipe.
- It replaces the in-view companion while on, so there is only ever one companion on screen. macOS and Linux fall back to the in-view companion for now.

---

## ⌨️ Commands

Access these commands anytime from the VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Title | Description |
|---|---|---|
| `unagi.focus` | `UNAGI: Open Sprints, Notes & Timer` | Opens and focuses the UNAGI sidebar view. |
| `unagi.addTask` | `UNAGI: Quick Add Sprint Task` | Quickly adds a sprint task with priority from the command prompt. |
| `unagi.toggleTimer` | `UNAGI: Start / Pause Focus Timer` | Starts or pauses the active focus countdown timer. |
| `unagi.openInEditor` | `UNAGI: Open in Editor Tab` | Opens UNAGI in an editor tab with more room for the companion. |
| `unagi.toggleCompanion` | `UNAGI: Show / Hide Companion` | Shows or hides the in-view roaming companion. |
| `unagi.toggleDesktopCompanion` | `UNAGI: Toggle Desktop Companion` | Lets the companion roam your whole screen (Windows). |
| `unagi.chooseCharacter` | `UNAGI: Choose Companion Character` | Pick Croagunk, Kurta Guy, or one of your own. |
| `unagi.createCharacter` | `UNAGI: Create Custom Character from a Photo` | Opens the character studio to turn a photo into a companion. |
| `unagi.deleteCharacter` | `UNAGI: Delete a Custom Character` | Removes a character you created. |

---

## ⚙️ Extension Settings

Configure UNAGI to match your preferred working rhythm in VS Code Settings (`Ctrl+,` / `Cmd+,` ➔ search `UNAGI`):

- `unagi.focusMinutes` *(number, default: `25`)*: Default focus timer duration in minutes.
- `unagi.reminderIntervalMinutes` *(number, default: `30`)*: Interval (in minutes) for checking and notifying about pending high-priority sprint tasks.
- `unagi.enableTaskReminders` *(boolean, default: `true`)*: Toggle periodic notification reminders for pending tasks.
- `unagi.water.enabled` *(boolean, default: `true`)*: Remind you to drink water.
- `unagi.water.intervalMinutes` *(number, default: `60`, 1 to 480)*: Minutes between water reminders.
- `unagi.companion.enabled` *(boolean, default: `true`)*: Show the in-view roaming companion.
- `unagi.desktopCompanion.enabled` *(boolean, default: `false`)*: Let the companion roam your whole screen (Windows only).
- `unagi.companion.character` *(string, default: `croagunk`)*: Id of your companion character. Easiest to change in the sidebar's Companion tab.
- `unagi.companion.movement` *(`free` | `floor`, default: `free`)*: `floor` walks left and right along the floor; `free` roams everywhere.

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
