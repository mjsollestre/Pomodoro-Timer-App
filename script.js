const { useEffect, useMemo, useRef, useState } = React;

const DEFAULT_SETTINGS = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsUntilLongBreak: 4,
  autoStartNext: false,
  sound: true,
};

const STORAGE_KEY = 'pomodoro.settings.v1';

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch {}
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function useInterval(callback, delay) {
  const savedCallback = useRef();
  useEffect(() => { savedCallback.current = callback; });
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current && savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    o.start();
    o.stop(ctx.currentTime + 0.26);
  } catch {}
}

const Mode = { Work: 'WORK', Short: 'SHORT', Long: 'LONG' };

function NumberInput(props) {
  const { label, value, onChange, min = 1, max = 180 } = props;
  return React.createElement(
    'div',
    null,
    React.createElement(
      'label',
      null,
      label,
      React.createElement('input', {
        className: 'input',
        type: 'number',
        value,
        min,
        max,
        onChange: (e) => onChange(Number(e.target.value || 0)),
      })
    )
  );
}

function SettingsModal(props) {
  const { settings, onSave, onClose } = props;
  const [local, setLocal] = useState(settings);
  function setField(key, val) { setLocal((s) => ({ ...s, [key]: val })); }

  return React.createElement(
    'div',
    { className: 'modal-backdrop', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement(
      'div',
      { className: 'modal', role: 'dialog', 'aria-modal': 'true' },
      React.createElement('h3', null, 'Settings'),
      React.createElement(
        'div',
        { className: 'grid-2' },
        React.createElement(NumberInput, { label: 'Work (minutes)', value: local.workMinutes, onChange: (v) => setField('workMinutes', Math.max(1, v)) }),
        React.createElement(NumberInput, { label: 'Short Break (minutes)', value: local.shortBreakMinutes, onChange: (v) => setField('shortBreakMinutes', Math.max(1, v)) }),
        React.createElement(NumberInput, { label: 'Long Break (minutes)', value: local.longBreakMinutes, onChange: (v) => setField('longBreakMinutes', Math.max(1, v)) }),
        React.createElement(NumberInput, { label: 'Rounds until long break', value: local.roundsUntilLongBreak, onChange: (v) => setField('roundsUntilLongBreak', Math.max(1, v)) })
      ),
      React.createElement(
        'div',
        { className: 'row', style: { marginTop: 10 } },
        React.createElement(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', { type: 'checkbox', checked: local.autoStartNext, onChange: (e) => setField('autoStartNext', e.target.checked) }),
          'Auto-start next session'
        ),
        React.createElement(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('input', { type: 'checkbox', checked: local.sound, onChange: (e) => setField('sound', e.target.checked) }),
          'Sound alert'
        )
      ),
      React.createElement(
        'div',
        { className: 'modal-actions' },
        React.createElement('button', { className: 'btn', onClick: onClose }, 'Cancel'),
        React.createElement('button', { className: 'btn primary', onClick: () => onSave(local) }, 'Save')
      )
    )
  );
}

function App() {
  const [settings, setSettings] = useState(loadSettings);
  const [mode, setMode] = useState(Mode.Work);
  const [isRunning, setIsRunning] = useState(false);
  const [roundsCompleted, setRoundsCompleted] = useState(0);

  const initialSeconds = useMemo(() => {
    if (mode === Mode.Work) return settings.workMinutes * 60;
    if (mode === Mode.Short) return settings.shortBreakMinutes * 60;
    return settings.longBreakMinutes * 60;
  }, [mode, settings]);

  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  useEffect(() => { setSecondsLeft(initialSeconds); }, [initialSeconds]);
  useEffect(() => { saveSettings(settings); }, [settings]);

  useInterval(() => {
    setSecondsLeft((s) => {
      if (s <= 1) {
        if (settings.sound) beep();
        onCompleteCycle();
        return 0;
      }
      return s - 1;
    });
  }, isRunning ? 1000 : null);

  function onCompleteCycle() {
    setIsRunning(false);
    if (mode === Mode.Work) {
      const nextRounds = roundsCompleted + 1;
      setRoundsCompleted(nextRounds);
      const shouldLong = nextRounds % settings.roundsUntilLongBreak === 0;
      const nextMode = shouldLong ? Mode.Long : Mode.Short;
      setMode(nextMode);
      if (settings.autoStartNext) setIsRunning(true);
    } else {
      setMode(Mode.Work);
      if (settings.autoStartNext) setIsRunning(true);
    }
  }

  function handleStartPause() { setIsRunning((r) => !r); }
  function handleReset() { setIsRunning(false); setSecondsLeft(initialSeconds); }
  function switchMode(next) { setIsRunning(false); setMode(next); }

  const total = initialSeconds || 1;
  const progress = Math.max(0, Math.min(100, (1 - secondsLeft / total) * 100));

  const [openSettings, setOpenSettings] = useState(false);

  return React.createElement(
    'div',
    { className: 'app' },
    React.createElement(
      'div',
      { className: 'header' },
      React.createElement(
        'div',
        { className: 'brand' },
        React.createElement('div', { className: 'logo' }, '⏱'),
        'Pomodoro Focus'
      ),
      React.createElement(
        'div',
        { className: 'row' },
        React.createElement('button', { className: 'btn', onClick: () => setOpenSettings(true) }, 'Settings')
      )
    ),

    React.createElement(
      'div',
      { className: 'card' },
      React.createElement(
        'div',
        { className: 'modes' },
        React.createElement('div', { className: `tab ${mode === Mode.Work ? 'active' : ''}`, onClick: () => switchMode(Mode.Work) }, 'Pomodoro'),
        React.createElement('div', { className: `tab ${mode === Mode.Short ? 'active' : ''}`, onClick: () => switchMode(Mode.Short) }, 'Short Break'),
        React.createElement('div', { className: `tab ${mode === Mode.Long ? 'active' : ''}`, onClick: () => switchMode(Mode.Long) }, 'Long Break')
      ),

      React.createElement(
        'div',
        { className: 'timer' },
        React.createElement('div', { className: 'time' }, formatTime(secondsLeft)),
        React.createElement(
          'div',
          { className: 'controls' },
          React.createElement('button', { className: `btn ${isRunning ? '' : 'primary'}`, onClick: handleStartPause }, isRunning ? 'Pause' : 'Start'),
          React.createElement('button', { className: 'btn', onClick: handleReset }, 'Reset')
        ),
        React.createElement(
          'div',
          { className: 'row', style: { justifyContent: 'flex-end' } },
          React.createElement('button', { className: 'btn danger', onClick: () => { setRoundsCompleted(0); } }, 'Clear Rounds')
        )
      ),

      React.createElement(
        'div',
        { className: 'meta' },
        React.createElement('div', null, 'Mode: ', (mode === Mode.Work ? 'Pomodoro' : (mode === Mode.Short ? 'Short Break' : 'Long Break'))),
        React.createElement('div', null, `Rounds: ${roundsCompleted} / ${settings.roundsUntilLongBreak} (until long break)`)
      ),
      React.createElement(
        'div',
        { className: 'progress-track', 'aria-hidden': true },
        React.createElement('div', { className: 'progress-bar', style: { width: `${progress}%` } })
      )
    ),

    React.createElement(
      'div',
      { className: 'footer' },
      React.createElement('div', null, 'Created by mjsollestre'),
      React.createElement('a', { className: 'link', href: 'https://en.wikipedia.org/wiki/Pomodoro_Technique', target: '_blank', rel: 'noreferrer' }, 'Pomodoro Technique')
    ),

    openSettings && React.createElement(SettingsModal, { settings, onClose: () => setOpenSettings(false), onSave: (s) => { setSettings(s); setOpenSettings(false); } })
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));

