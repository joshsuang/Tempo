# Tempo

> A calm, timer-first focus app for deep work, studying, and intentional breaks.

Tempo is a lightweight local-first focus timer designed to feel at home on a MacBook Air: fast to start, quiet while running, and powerful without becoming a productivity dashboard.

## Why Tempo?

- **Timer first** — the remaining time is always the primary focus.
- **Calm by default** — neutral surfaces, restrained motion, and no gamification.
- **Fast to operate** — keyboard shortcuts, command palette actions, and one-click presets.
- **Local-first** — settings, tasks, presets, recent sessions, and timer state stay on your device.
- **Flexible** — Pomodoro, Stopwatch, Until, and custom Countdown modes in one focused workspace.

## Features at a glance

| Area | Included |
| --- | --- |
| Timer modes | Pomodoro, Stopwatch, Until, custom Countdown |
| Pomodoro | Focus/break presets, automatic transitions, custom presets |
| Countdown | Natural input such as `45m` or `1h 20m`, named quick durations, recent durations |
| Focus context | One focused task, recent task templates, task editing and clearing |
| Visuals | Circle, Line, Growing Tree, Dot, Orbit, Wave, Mountain, Vertical |
| Focus mode | Optional dimming/blur, centered active content, adjustable intensity, mini timer layout |
| Controls | Pause/resume, reset, ±5/±10 minute buttons, keyboard duration adjustments |
| Notifications | Desktop notifications for completions and Pomodoro transitions |
| Sounds | Completion sound, volume control, test sound action |
| Persistence | LocalStorage timer recovery, preferences, presets, tasks, recent sessions |
| Data | Local JSON export and import |
| Appearance | Light, dark, system appearance, accent color customization |
| Accessibility | Semantic controls, focus states, live timer/completion announcements, reduced motion support |
| Installability | Tempo favicon, branded app icon, Apple touch icon, web manifest |

## Timer modes

### Pomodoro

Choose a built-in or custom rhythm such as `25/5`, `50/10`, or `90/15`. Tempo can automatically move between focus and break sessions, or stop and let you choose what happens next.

### Stopwatch

Count upward for open-ended work. Start, pause, resume, and reset without a countdown limit.

### Until

Choose a target clock time. Tempo calculates the remaining time automatically and keeps the target visible while the timer runs.

### Custom Countdown

Enter a duration directly:

```text
45m
1h 20m
90
```

Tempo also provides compact quick durations for Short, Study, and Deep focus sessions, plus recently used durations.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Space` | Start or pause the timer |
| `R` | Reset the timer |
| `+` / `=` | Add 5 minutes |
| `-` | Remove 5 minutes |
| `Enter` | Open the task editor, or save the task while editing |
| `E` | Open the task editor |
| `1` | Pomodoro |
| `2` | Stopwatch |
| `3` | Until |
| `4` | Countdown |
| `⌘K` / `Ctrl K` | Open the command palette |
| `Esc` | Close an open command palette |

Shortcuts do not interfere with text fields.

## Command palette

Open the palette with `⌘K` on macOS or `Ctrl K` elsewhere. It provides keyboard-first access to:

- Start/pause and reset
- Add or remove five minutes
- Edit or clear the focused task
- Switch timer modes
- Open Settings
- Toggle appearance

Use the arrow keys to navigate and Enter to execute an action.

## Focus mode

Focus mode is optional and can be configured in Settings. When enabled, Tempo can:

- Center the active timer composition
- Keep the focused task readable, including long wrapped task names
- Dim and blur surrounding interface elements while running
- Keep Until and Countdown setup controls out of the way while active
- Use a subtle, focused, or immersive intensity
- Switch to a compact mini timer layout

The Reset control remains a clear rectangular button, while the primary start/pause action can use the focused icon treatment.

## Local data and recovery

Tempo does not require an account. It stores data locally in the browser, including:

- Settings and appearance preferences
- Custom Pomodoro presets
- Focused task and recent task templates
- Recent Countdown durations
- Recent completed sessions
- Active timer state for resume-on-reopen

Settings also include **Export Tempo data** and **Import Tempo data** for local backups.

## Run locally

### Requirements

- Node.js 18+
- npm

### Development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

### Production build

```bash
npm run build
```

### Preview the production build

```bash
npm run preview
```

## Project structure

```text
.
├── public/
│   ├── manifest.webmanifest
│   └── tempo-icon.svg
├── src/
│   ├── App.tsx            # Timer state, pages, settings, persistence, UI composition
│   ├── CommandPalette.tsx # Keyboard-first command actions
│   ├── main.tsx           # React entry point
│   └── styles.css         # Responsive visual system and timer states
├── index.html
├── package.json
└── vite.config.ts
```

The app keeps timer behavior, persistence, presentation, and command actions separated without introducing unnecessary runtime dependencies.

## Design principles

Tempo intentionally does **not** include accounts, streaks, achievements, goals, analytics dashboards, or multi-task project management. The product is designed to help someone answer three questions immediately:

1. What mode am I using?
2. How much time is left?
3. What am I focusing on?

## Accessibility and browser behavior

- Keyboard navigation and visible focus states are supported.
- Timer and completion changes use live announcements where appropriate.
- `prefers-reduced-motion` is respected.
- Desktop notifications require browser permission.
- Wake Lock and audio are optional browser capabilities and degrade gracefully when unavailable.
- Background-safe timer calculations use wall-clock timestamps rather than relying only on interval accuracy.

## Tech stack

- React
- TypeScript
- Vite
- CSS
- Browser LocalStorage and Web APIs

## License

Add the license that matches how you plan to distribute Tempo.
