// Minimal, modern Pomodoro timer with WebAudio alarm and basic stats.
// Open index.html in a browser. Press Space to Start/Pause, R to reset.

const qs = sel => document.querySelector(sel);
const qsa = sel => Array.from(document.querySelectorAll(sel));

const timeEl = qs('#time');
const startBtn = qs('#startBtn');
const pauseBtn = qs('#pauseBtn');
const resetBtn = qs('#resetBtn');
const ringFg = document.querySelector('.ring-fg');
const sessionTypeEl = qs('#sessionType');
const subtextEl = qs('#subtext');
const presets = qsa('.preset');
const soundToggle = qs('#soundToggle');
const notifyToggle = qs('#notifyToggle');

const todaySessionsEl = qs('#todaySessions');
const totalTimeEl = qs('#totalTime');
const streakEl = qs('#streak');
const historyList = qs('#historyList');

const settingsBtn = qs('#settingsBtn');
const settingsModal = qs('#settingsModal');
const closeSettings = qs('#closeSettings');
const saveSettings = qs('#saveSettings');
const cancelSettings = qs('#cancelSettings');

const focusLengthInput = qs('#focusLength');
const shortLengthInput = qs('#shortLength');
const longLengthInput = qs('#longLength');
const sessionsBeforeLongInput = qs('#sessionsBeforeLong');
const alarmVolumeInput = qs('#alarmVolume');

const STORAGE_KEY = 'focus_timer_data_v1';

let audioCtx = null;
let masterGain = null;
let alarmVol = parseFloat(alarmVolumeInput.value || 0.8);

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = alarmVol;
    masterGain.connect(audioCtx.destination);
  }
}

function playModernAlarm() {
  if (!soundToggle.checked) return;
  ensureAudio();
  // A short, modern rising alarm: start with tone sweep + pulsed sequence
  const now = audioCtx.currentTime;
  // Sweeping oscillator
  const o = audioCtx.createOscillator();
  const f = audioCtx.createBiquadFilter();
  const g = audioCtx.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(220, now);
  o.frequency.exponentialRampToValueAtTime(880, now + 1.4);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.18, now + 0.12);
  g.gain.linearRampToValueAtTime(0.02, now + 1.4);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(2000, now);
  f.frequency.linearRampToValueAtTime(1200, now + 1.6);
  o.connect(f);
  f.connect(g);
  g.connect(masterGain);
  o.start(now);
  o.stop(now + 1.7);

  // Pulses
  for (let i = 0; i < 4; i++) {
    const t = now + 1.45 + i * 0.22;
    const p = audioCtx.createOscillator();
    const pg = audioCtx.createGain();
    p.type = i % 2 ? 'sine' : 'triangle';
    p.frequency.setValueAtTime(880 - i * 60, t);
    pg.gain.setValueAtTime(0, t);
    pg.gain.linearRampToValueAtTime(0.25, t + 0.01);
    pg.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    p.connect(pg);
    pg.connect(masterGain);
    p.start(t);
    p.stop(t + 0.26);
  }
}

// Timer logic
class Timer {
  constructor() {
    this.mode = 'focus'; // 'focus' | 'short' | 'long'
    this.durations = { focus: 25 * 60, short: 5 * 60, long: 15 * 60 };
    this.sessionsBeforeLong = 4;
    this.running = false;
    this.remaining = this.durations.focus;
    this._raf = null;
    this.endTime = null;
    this.completedSessions = 0; // since last long break
  }

  setDurations({ focus, short, long, sessionsBeforeLong }) {
    if (focus) this.durations.focus = focus * 60;
    if (short) this.durations.short = short * 60;
    if (long) this.durations.long = long * 60;
    if (sessionsBeforeLong) this.sessionsBeforeLong = sessionsBeforeLong;
    if (!this.running) {
      this.remaining = this.durations[this.mode];
      updateDisplay();
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.endTime = Date.now() + this.remaining * 1000;
    this._tick();
  }

  pause() {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.remaining = Math.max(0, Math.round((this.endTime - Date.now()) / 1000));
  }

  reset() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.remaining = this.durations[this.mode];
    updateDisplay();
  }

  _tick() {
    const now = Date.now();
    this.remaining = Math.max(0, Math.round((this.endTime - now) / 1000));
    updateDisplay();
    if (this.remaining <= 0) {
      this.running = false;
      cancelAnimationFrame(this._raf);
      this._onComplete();
      return;
    }
    this._raf = requestAnimationFrame(() => this._tick());
  }

  _onComplete() {
    // play sound & notify
    playModernAlarm();
    if (notifyToggle.checked && 'Notification' in window) {
      try { Notification.requestPermission().then(p => { if (p === 'granted') new Notification('Focus', { body: `${capitalize(this.mode)} session completed` }); }); } catch (e) {}
    }
    // save session if a focus session completed
    if (this.mode === 'focus') {
      recordSession(this.durations.focus);
      this.completedSessions++;
    }

    // switch mode
    if (this.mode === 'focus') {
      if (this.completedSessions >= this.sessionsBeforeLong) {
        this.mode = 'long';
        this.completedSessions = 0;
      } else {
        this.mode = 'short';
      }
    } else {
      this.mode = 'focus';
    }

    this.remaining = this.durations[this.mode];
    updateDisplay();
    // Auto-start next session
    // small delay to allow alarm to be heard
    setTimeout(() => this.start(), 700);
  }

  setMode(mode) {
    this.mode = mode;
    this.remaining = this.durations[mode];
    updateDisplay();
  }
}

const timer = new Timer();

// UI updates
function formatTime(s) {
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

function updateRing(remaining, total) {
  const circumference = 2 * Math.PI * 52;
  const pct = Math.max(0, Math.min(1, remaining / total));
  const offset = Math.round(circumference * (1 - pct));
  ringFg.style.strokeDashoffset = offset;
}

function updateDisplay() {
  const total = timer.durations[timer.mode];
  timeEl.textContent = formatTime(timer.remaining);
  sessionTypeEl.textContent = capitalize(timer.mode);
  updateRing(timer.remaining, total);
  startBtn.disabled = timer.running;
  pauseBtn.disabled = !timer.running;
  subtextEl.textContent = `${timer.completedSessions} / ${timer.sessionsBeforeLong} before long break`;
  // update active preset highlight
  qsa('.preset').forEach(p => {
    p.classList.toggle('active', p.dataset.mode === timer.mode);
  });
  saveState();
}

// Stats & persistence
function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { sessions: [] , settings: {} };
    return JSON.parse(raw);
  } catch (e) { return { sessions: [] , settings: {} } }
}

function saveState() {
  const state = loadState();
  // don't override session list, only durations & settings
  state.settings = {
    durations: {
      focus: timer.durations.focus / 60,
      short: timer.durations.short / 60,
      long: timer.durations.long / 60
    },
    sessionsBeforeLong: timer.sessionsBeforeLong,
    alarmVolume: alarmVol
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function recordSession(seconds) {
  const state = loadState();
  state.sessions = state.sessions || [];
  state.sessions.unshift({ startedAt: Date.now(), duration: seconds });
  // keep recent 200
  state.sessions = state.sessions.slice(0, 200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  renderStats();
}

function renderStats() {
  const state = loadState();
  const sessions = (state.sessions || []).map(s => ({ ...s }));
  // Today sessions
  const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
  const today = sessions.filter(s => s.startedAt >= startOfDay.getTime());
  todaySessionsEl.textContent = today.length;

  const totalSeconds = sessions.reduce((a,b) => a + b.duration, 0);
  totalTimeEl.textContent = `${Math.round(totalSeconds / 60)}m`;

  // Streak: count distinct days with >=1 session, contiguous up to today
  const days = Array.from(new Set(sessions.map(s => {
    const d = new Date(s.startedAt);
    d.setHours(0,0,0,0);
    return d.getTime();
  }))).sort((a,b)=>a-b);
  let streak = 0;
  let cursor = new Date(); cursor.setHours(0,0,0,0);
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] === cursor.getTime()) {
      streak++;
      cursor = new Date(cursor.getTime() - 24*60*60*1000);
    } else if (days[i] < cursor.getTime()) {
      break;
    }
  }
  streakEl.textContent = streak;

  // History list (recent 10)
  historyList.innerHTML = '';
  sessions.slice(0,10).forEach(s => {
    const li = document.createElement('li');
    const d = new Date(s.startedAt);
    li.innerHTML = `<span>${d.toLocaleString()}</span><span>${Math.round(s.duration/60)}m</span>`;
    historyList.appendChild(li);
  });
}

// Utilities
function capitalize(s){ return s && s[0].toUpperCase() + s.slice(1) }

// Event wiring
startBtn.addEventListener('click', () => {
  timer.start();
  ensureAudio(); // resume audio context on user gesture
});
pauseBtn.addEventListener('click', () => timer.pause());
resetBtn.addEventListener('click', () => timer.reset());

presets.forEach(p => {
  p.addEventListener('click', () => {
    const mode = p.dataset.mode;
    timer.setMode(mode);
  });
});

soundToggle.addEventListener('change', () => {
  // no-op; sound used at end
});

alarmVolumeInput.addEventListener('input', (e) => {
  alarmVol = parseFloat(e.target.value);
  if (masterGain) masterGain.gain.value = alarmVol;
  saveState();
});

// Keyboard shortcuts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (timer.running) timer.pause(); else timer.start();
  } else if (e.key.toLowerCase() === 'r') {
    timer.reset();
  }
});

// Settings modal
settingsBtn.addEventListener('click', () => {
  openSettings();
});
closeSettings.addEventListener('click', () => closeSettingsModal());
cancelSettings.addEventListener('click', () => closeSettingsModal());
saveSettings.addEventListener('click', () => {
  const f = Number(focusLengthInput.value) || 25;
  const s = Number(shortLengthInput.value) || 5;
  const l = Number(longLengthInput.value) || 15;
  const b = Number(sessionsBeforeLongInput.value) || 4;
  const vol = Number(alarmVolumeInput.value) || 0.8;
  timer.setDurations({ focus: f, short: s, long: l, sessionsBeforeLong: b });
  alarmVol = vol;
  if (masterGain) masterGain.gain.value = alarmVol;
  closeSettingsModal();
});

function openSettings(){
  const state = loadState();
  const s = state.settings || {};
  focusLengthInput.value = s.durations?.focus ?? timer.durations.focus / 60;
  shortLengthInput.value = s.durations?.short ?? timer.durations.short / 60;
  longLengthInput.value = s.durations?.long ?? timer.durations.long / 60;
  sessionsBeforeLongInput.value = s.sessionsBeforeLong ?? timer.sessionsBeforeLong;
  alarmVolumeInput.value = s.alarmVolume ?? alarmVol;
  settingsModal.setAttribute('aria-hidden', 'false');
}
function closeSettingsModal(){
  settingsModal.setAttribute('aria-hidden', 'true');
}

// Load stored settings on start
(function initFromStorage(){
  const state = loadState();
  if (state.settings?.durations) {
    const d = state.settings.durations;
    timer.setDurations({
      focus: d.focus,
      short: d.short,
      long: d.long,
      sessionsBeforeLong: state.settings.sessionsBeforeLong
    });
  }
  if (state.settings?.alarmVolume) {
    alarmVol = Number(state.settings.alarmVolume);
    alarmVolumeInput.value = alarmVol;
  }
  updateDisplay();
  renderStats();
})();

// Small UI polish: animate ring on update (already via CSS transition)
updateDisplay();

// Request notification permission proactively (optional)
if ('Notification' in window && Notification.permission === 'default') {
  // don't spam — request on interaction
  window.addEventListener('click', function once() {
    Notification.requestPermission().catch(()=>{});
    window.removeEventListener('click', once);
  });
}
