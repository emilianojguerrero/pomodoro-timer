# Focus — Modern Pomodoro Timer

A lightweight, elegant Pomodoro/focus timer built for the web with:
- Modern, minimal UI inspired by Apple's clean aesthetic
- Smooth circular progress ring and subtle gradients
- Configurable focus/short/long durations
- Modern alarm sound generated with WebAudio (no external files required)
- Local stats: sessions, total focus minutes, streak, recent sessions
- Notifications support and keyboard shortcuts

How to use
- Open `index.html` in a modern browser (Chrome, Edge, Safari, Firefox).
- Start/pause with the Start and Pause buttons, or press Space.
- Reset with the Reset button or press R.
- Click Settings (⚙️) to change durations, alarm volume, and sessions before a long break.
- Sound on/off and desktop notifications can be toggled.

Implementation notes
- The alarm is generated programmatically using the WebAudio API for a clean, modern "rising chirp + pulses" sound.
- Stats and settings are persisted to `localStorage` under `focus_timer_data_v1`.
- No build step: files are plain HTML/CSS/JS.

Accessibility & Permissions
- Notifications require permission; the app will prompt for permission on user interaction.
- Audio context is resumed on user gesture to comply with browser autoplay policies.

Customization ideas
- Add theme toggles (light/dark)
- Add long-term charts (weekly/monthly)
- Export/import session history

Enjoy focused time!
