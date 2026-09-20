import { useCallback, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'

type Mode = 'pomodoro' | 'stopwatch' | 'until'
type Appearance = 'light' | 'dark' | 'system'
type Visual = 'circle' | 'line' | 'tree' | 'dot' | 'orbit' | 'wave' | 'mountain' | 'vertical'
type Page = 'timer' | 'presets' | 'settings'
type SessionPhase = 'focus' | 'break'

type Preset = { id: string; name: string; focus: number; break: number }
type Settings = {
  appearance: Appearance
  accent: string
  defaultMode: Mode
  defaultPresetId: string
  visual: Visual
  autoStartBreaks: boolean
  autoStartFocus: boolean
  showSeconds: boolean
  confirmReset: boolean
  keepAwake: boolean
  sound: boolean
  volume: number
  rememberLastMode: boolean
  lastMode: Mode
}
type Persisted = {
  settings: Settings
  presets: Preset[]
  task: string
  selectedPresetId: string
  mode: Mode
  untilTarget: string
}

const STORAGE_KEY = 'tempo-app-v1'
const accents = [
  { name: 'Indigo', value: '#5b5ce2' },
  { name: 'Terracotta', value: '#c86b52' },
  { name: 'Forest', value: '#3e8b6d' },
  { name: 'Amber', value: '#d28b2f' },
  { name: 'Plum', value: '#8c5ca8' },
]
const visualOptions: { id: Visual; label: string; description: string }[] = [
  { id: 'circle', label: 'Circle', description: 'A quiet, continuous loop' },
  { id: 'line', label: 'Line', description: 'Simple horizontal progress' },
  { id: 'tree', label: 'Growing Tree', description: 'A living sense of time' },
  { id: 'dot', label: 'Dot', description: 'A minimal sequence of moments' },
  { id: 'orbit', label: 'Orbit', description: 'A gentle ring in motion' },
  { id: 'wave', label: 'Wave', description: 'A soft, flowing rhythm' },
  { id: 'mountain', label: 'Mountain', description: 'A steady landscape ascent' },
  { id: 'vertical', label: 'Vertical', description: 'Calm progress, top to bottom' },
]
const initialPresets: Preset[] = [
  { id: 'classic', name: 'Classic', focus: 25, break: 5 },
  { id: 'deep-work', name: 'Deep Work', focus: 50, break: 10 },
  { id: 'long-form', name: 'Long Form', focus: 90, break: 15 },
]
const initialSettings: Settings = {
  appearance: 'light', accent: '#5b5ce2', defaultMode: 'pomodoro', defaultPresetId: 'deep-work', visual: 'circle',
  autoStartBreaks: true, autoStartFocus: false, showSeconds: true, confirmReset: true, keepAwake: false,
  sound: true, volume: 70, rememberLastMode: true, lastMode: 'pomodoro',
}

const readStorage = (): Persisted => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) throw new Error('empty')
    const parsed = JSON.parse(raw) as Partial<Persisted>
    return {
      settings: { ...initialSettings, ...(parsed.settings ?? {}) },
      presets: Array.isArray(parsed.presets) && parsed.presets.length ? parsed.presets : initialPresets,
      task: typeof parsed.task === 'string' ? parsed.task : '',
      selectedPresetId: typeof parsed.selectedPresetId === 'string' ? parsed.selectedPresetId : 'deep-work',
      mode: parsed.mode === 'stopwatch' || parsed.mode === 'until' || parsed.mode === 'pomodoro' ? parsed.mode : 'pomodoro',
      untilTarget: typeof parsed.untilTarget === 'string' ? parsed.untilTarget : '17:00',
    }
  } catch {
    return { settings: initialSettings, presets: initialPresets, task: '', selectedPresetId: 'deep-work', mode: 'pomodoro', untilTarget: '17:00' }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const formatClock = (seconds: number, showSeconds = true) => {
  const safe = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const minutes = Math.floor(safe / 60)
  const secs = safe % 60
  return showSeconds ? `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes} min`
}
const playCompletionSound = (volume: number) => {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextClass) return
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'; oscillator.frequency.value = 660
    gain.gain.setValueAtTime(Math.max(.01, volume / 1000), context.currentTime)
    gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .45)
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + .45)
  } catch { /* Audio is optional and can be blocked by the browser. */ }
}
const formatUntil = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds))
  if (safe >= 3600) return `${Math.floor(safe / 60)} min`
  return formatClock(safe, true)
}
const modeName = (mode: Mode) => mode === 'pomodoro' ? 'Pomodoro' : mode === 'stopwatch' ? 'Stopwatch' : 'Until'

function App() {
  const saved = useMemo(readStorage, [])
  const [page, setPage] = useState<Page>('timer')
  const [settings, setSettings] = useState<Settings>(saved.settings)
  const [presets, setPresets] = useState<Preset[]>(saved.presets)
  const [task, setTask] = useState(saved.task)
  const [mode, setMode] = useState<Mode>(settings.rememberLastMode ? saved.mode : settings.defaultMode)
  const [selectedPresetId, setSelectedPresetId] = useState(saved.selectedPresetId)
  const [untilTarget, setUntilTarget] = useState(saved.untilTarget)
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0]
  const [phase, setPhase] = useState<SessionPhase>('focus')
  const [remaining, setRemaining] = useState(selectedPreset.focus * 60)
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const [showTaskEditor, setShowTaskEditor] = useState(false)
  const [taskDraft, setTaskDraft] = useState(task)
  const [message, setMessage] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, presets, task, selectedPresetId, mode, untilTarget } satisfies Persisted))
  }, [settings, presets, task, selectedPresetId, mode, untilTarget])

  const getUntilSeconds = useCallback(() => {
    const [hours, minutes] = untilTarget.split(':').map(Number)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 0
    const now = new Date()
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  }, [untilTarget])

  useEffect(() => {
    if (!running) return
    const interval = window.setInterval(() => {
      if (mode === 'stopwatch') setElapsed((value) => value + 1)
      else if (mode === 'until') setRemaining(getUntilSeconds())
      else {
        setRemaining((value) => {
          if (value > 1) return value - 1
          if (settings.sound) playCompletionSound(settings.volume)
          const nextPhase: SessionPhase = phase === 'focus' ? 'break' : 'focus'
          const nextDuration = nextPhase === 'focus' ? selectedPreset.focus * 60 : selectedPreset.break * 60
          setPhase(nextPhase)
          if ((nextPhase === 'break' && settings.autoStartBreaks) || (nextPhase === 'focus' && settings.autoStartFocus)) return nextDuration
          setRunning(false)
          return nextDuration
        })
      }
    }, 1000)
    return () => window.clearInterval(interval)
  }, [running, mode, phase, selectedPreset, settings.autoStartBreaks, settings.autoStartFocus, getUntilSeconds])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (event.code === 'Space') { event.preventDefault(); setRunning((value) => !value) }
      if (event.key.toLowerCase() === 'r') resetTimer()
      if (event.key === '1') changeMode('pomodoro')
      if (event.key === '2') changeMode('stopwatch')
      if (event.key === '3') changeMode('until')
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.dataset.theme = settings.appearance === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.appearance
      document.documentElement.style.setProperty('--accent', settings.accent)
    }
    applyTheme()
    if (settings.appearance !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', applyTheme)
    return () => media.removeEventListener('change', applyTheme)
  }, [settings.appearance, settings.accent])

  useEffect(() => {
    if (!settings.keepAwake || !running || !('wakeLock' in navigator)) return
    let sentinel: { release: () => Promise<void> } | null = null
    navigator.wakeLock.request('screen').then((lock) => { sentinel = lock }).catch(() => undefined)
    return () => { sentinel?.release().catch(() => undefined) }
  }, [settings.keepAwake, running])

  const totalDuration = mode === 'pomodoro' ? (phase === 'focus' ? selectedPreset.focus : selectedPreset.break) * 60 : mode === 'until' ? Math.max(1, getUntilSeconds()) : Math.max(1, elapsed)
  const progress = mode === 'stopwatch' ? Math.min(1, elapsed / (60 * 60)) : totalDuration ? (totalDuration - remaining) / totalDuration : 0
  const displayTime = mode === 'stopwatch' ? formatClock(elapsed, true) : mode === 'until' ? formatUntil(remaining) : formatClock(remaining, settings.showSeconds)

  function changeMode(next: Mode) {
    setRunning(false); setMode(next); setPhase('focus'); setElapsed(0)
    setRemaining(next === 'pomodoro' ? selectedPreset.focus * 60 : next === 'until' ? getUntilSeconds() : 0)
    setPage('timer')
  }
  function changePreset(id: string) {
    const next = presets.find((preset) => preset.id === id)
    if (!next) return
    setRunning(false); setSelectedPresetId(id); setPhase('focus'); setRemaining(next.focus * 60)
  }
  function resetTimer() {
    if (settings.confirmReset && running && !window.confirm('Reset the current timer?')) return
    setRunning(false); setPhase('focus'); setElapsed(0)
    setRemaining(mode === 'pomodoro' ? selectedPreset.focus * 60 : mode === 'until' ? getUntilSeconds() : 0)
  }
  function saveTask() { setTask(taskDraft.trim()); setShowTaskEditor(false) }
  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((current) => ({ ...current, [key]: value })) }
  function notify(text: string) { setMessage(text); window.setTimeout(() => setMessage(''), 2200) }
  function resetAll() {
    if (!window.confirm('Reset all Tempo settings, presets, and task?')) return
    localStorage.removeItem(STORAGE_KEY); window.location.reload()
  }

  return <div className={`app-shell ${running ? 'focus-mode' : ''}`}>
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">◒</span><span>tempo</span></div>
      <nav className="main-nav" aria-label="Main navigation">
        <NavItem active={page === 'timer'} onClick={() => setPage('timer')} icon="◷" label="Timer" />
        <NavItem active={page === 'presets'} onClick={() => setPage('presets')} icon="▦" label="Presets" />
        <NavItem active={page === 'settings'} onClick={() => setPage('settings')} icon="⚙" label="Settings" />
      </nav>
      <div className="sidebar-bottom"><span className="keyboard-dot">⌘</span><span>Built for focus</span></div>
    </aside>

    <main className="main-content">
      <header className="topbar">
        <div><p className="eyebrow">{page === 'timer' ? 'Good to see you' : 'Tempo'}</p><h1>{page === 'timer' ? 'Focus, in your rhythm.' : page === 'presets' ? 'Your presets.' : 'Make it yours.'}</h1></div>
        <div className="top-actions"><button className="icon-button" aria-label="Toggle appearance" onClick={() => updateSetting('appearance', settings.appearance === 'dark' ? 'light' : 'dark')}>{settings.appearance === 'dark' ? '☼' : '◐'}</button><div className="avatar">A</div></div>
      </header>

      {page === 'timer' && <TimerPage {...{ mode, changeMode, selectedPreset, selectedPresetId, changePreset, presets, phase, remaining, elapsed, running, setRunning, resetTimer, displayTime, progress, task, setShowTaskEditor, settings, untilTarget, setUntilTarget, getUntilSeconds }} />}
      {page === 'presets' && <PresetsPage presets={presets} setPresets={setPresets} selectedPresetId={selectedPresetId} changePreset={changePreset} notify={notify} />}
      {page === 'settings' && <SettingsPage settings={settings} presets={presets} updateSetting={updateSetting} resetAll={resetAll} />}
      {showTaskEditor && <TaskModal value={taskDraft} setValue={setTaskDraft} onClose={() => setShowTaskEditor(false)} onSave={saveTask} />}
      {message && <div className="toast">{message}</div>}
    </main>
  </div>
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{active && <span className="nav-indicator" />}</button>
}

type TimerPageProps = {
  mode: Mode; changeMode: (mode: Mode) => void; selectedPreset: Preset; selectedPresetId: string; changePreset: (id: string) => void; presets: Preset[]; phase: SessionPhase; remaining: number; elapsed: number; running: boolean; setRunning: (value: boolean | ((value: boolean) => boolean)) => void; resetTimer: () => void; displayTime: string; progress: number; task: string; setShowTaskEditor: (value: boolean) => void; settings: Settings; untilTarget: string; setUntilTarget: (value: string) => void; getUntilSeconds: () => number
}
function TimerPage(props: TimerPageProps) {
  const { mode, changeMode, selectedPreset, selectedPresetId, changePreset, presets, phase, running, setRunning, resetTimer, displayTime, progress, task, setShowTaskEditor, settings, untilTarget, setUntilTarget, getUntilSeconds } = props
  const phaseLabel = mode === 'pomodoro' ? (phase === 'focus' ? 'Focus session' : 'Break time') : mode === 'stopwatch' ? 'Open-ended' : 'Until your target'
  return <section className="timer-page">
    <div className="mode-tabs" role="tablist" aria-label="Timer modes">{(['pomodoro', 'stopwatch', 'until'] as Mode[]).map((item) => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => changeMode(item)}>{modeName(item)}</button>)}</div>
    <div className="timer-stage">
      <div className="stage-meta"><span className={`status-dot ${running ? 'live' : ''}`} />{running ? 'In progress' : 'Ready when you are'}</div>
      <div className="timer-heading"><span>{phaseLabel}</span>{mode === 'pomodoro' && <span className="session-count">{selectedPreset.focus}/{selectedPreset.break} min</span>}</div>
      <TimerVisual visual={settings.visual} progress={progress} running={running} accent={settings.accent} />
      <div className="timer-readout" aria-live="polite">{displayTime}</div>
      <div className="timer-controls"><button className="primary-button" onClick={() => setRunning((value) => !value)}><span>{running ? 'Ⅱ' : '▶'}</span>{running ? 'Pause' : 'Start'}</button><button className="secondary-button" onClick={resetTimer}>Reset <span className="shortcut">R</span></button></div>
      <div className="task-row"><div className="task-icon">⌁</div><div className="task-copy">{task ? <><span className="task-label">FOCUSING ON</span><strong>{task}</strong></> : <span className="empty-task">What are you focusing on?</span>}</div><button className="edit-task" onClick={() => setShowTaskEditor(true)}>{task ? 'Edit' : 'Add task'}</button></div>
    </div>
    <div className="timer-footer">
      <div className="context-block"><span className="context-label">{mode === 'pomodoro' ? 'CURRENT PRESET' : mode === 'until' ? 'TARGET TIME' : 'SESSION'}</span>{mode === 'pomodoro' ? <div className="preset-button-list" role="listbox" aria-label="Current Pomodoro preset">{presets.map((preset) => <button type="button" role="option" aria-selected={preset.id === selectedPresetId} className={`preset-pill ${preset.id === selectedPresetId ? 'chosen' : ''}`} key={preset.id} onClick={() => changePreset(preset.id)}><span>{preset.name}</span><small>{preset.focus}/{preset.break}</small></button>)}</div> : mode === 'until' ? <div className="until-input"><input aria-label="Target time" type="time" value={untilTarget} onChange={(event) => setUntilTarget(event.target.value)} /> <span>{getUntilSeconds() > 0 ? `${Math.ceil(getUntilSeconds() / 60)} min remaining` : 'Choose a future time'}</span></div> : <span className="footer-value">No time limit</span>}</div>
      <div className="context-block"><span className="context-label">NEXT UP</span><span className="footer-value">{mode === 'pomodoro' ? phase === 'focus' ? `Break · ${selectedPreset.break} min` : `Focus · ${selectedPreset.focus} min` : 'Take your time'}</span></div>
      <div className="shortcut-hint"><span>Shortcuts</span><kbd>Space</kbd><kbd>R</kbd></div>
    </div>
  </section>
}

function TimerVisual({ visual, progress, running, accent }: { visual: Visual; progress: number; running: boolean; accent: string }) {
  const safeProgress = clamp(progress, 0, 1)
  if (visual === 'line') return <div className="visual-wrap line-visual"><div className="line-track"><div className="line-fill" style={{ width: `${Math.max(2, safeProgress * 100)}%`, background: accent }} /></div><div className="line-endpoints"><span>begin</span><span>finish</span></div></div>
  if (visual === 'tree') return <div className="visual-wrap tree-visual"><div className="tree-ground" /><div className="tree-trunk" style={{ height: `${40 + safeProgress * 35}px` }} /><div className="tree-canopy" style={{ transform: `scale(${0.65 + safeProgress * 0.35})`, background: accent }} /><span className="tree-caption">{Math.round(safeProgress * 100)}% grown</span></div>
  if (visual === 'dot') return <div className="visual-wrap dot-visual">{Array.from({ length: 13 }).map((_, index) => <span key={index} className={index / 12 <= safeProgress ? 'filled' : ''} style={index / 12 <= safeProgress ? { background: accent } : undefined} />)}</div>
  if (visual === 'orbit') return <div className={`visual-wrap orbit-visual ${running ? 'spinning' : ''}`} style={{ '--orbit-color': accent } as CSSProperties}><span className="orbit-core" /><span className="orbit-ring ring-one" /><span className="orbit-ring ring-two" style={{ transform: `rotate(${safeProgress * 280}deg)` }} /></div>
  if (visual === 'wave') return <div className="visual-wrap wave-visual"><svg viewBox="0 0 320 56" role="img" aria-label="Wave progression"><path className="wave-base" d="M0 28 C 40 4, 70 52, 110 28 S 180 4, 220 28 S 280 52, 320 28" /><path className="wave-progress" style={{ stroke: accent, strokeDasharray: '360', strokeDashoffset: `${360 - safeProgress * 360}` }} d="M0 28 C 40 4, 70 52, 110 28 S 180 4, 220 28 S 280 52, 320 28" /></svg></div>
  if (visual === 'mountain') return <div className="visual-wrap mountain-visual"><svg viewBox="0 0 320 80" role="img" aria-label="Mountain progression"><path className="mountain-base" d="M0 70 L70 42 L112 58 L180 15 L232 54 L275 36 L320 70 Z" /><path className="mountain-fill" style={{ fill: accent, clipPath: `inset(0 ${100 - safeProgress * 100}% 0 0)` }} d="M0 70 L70 42 L112 58 L180 15 L232 54 L275 36 L320 70 Z" /></svg></div>
  if (visual === 'vertical') return <div className="visual-wrap vertical-visual"><div className="vertical-track"><div style={{ height: `${Math.max(5, safeProgress * 100)}%`, background: accent }} /></div><span>time passes quietly</span></div>
  const circumference = 2 * Math.PI * 116
  return <div className="visual-wrap circle-visual"><svg viewBox="0 0 280 280" aria-hidden="true"><circle className="circle-track" cx="140" cy="140" r="116" /><circle className="circle-progress" cx="140" cy="140" r="116" style={{ stroke: accent, strokeDasharray: circumference, strokeDashoffset: circumference * (1 - safeProgress) }} /></svg><div className="circle-tick top" /><div className="circle-tick bottom" /></div>
}

function PresetsPage({ presets, setPresets, selectedPresetId, changePreset, notify }: { presets: Preset[]; setPresets: (value: Preset[] | ((value: Preset[]) => Preset[])) => void; selectedPresetId: string; changePreset: (id: string) => void; notify: (message: string) => void }) {
  const [editing, setEditing] = useState<Preset | null>(null)
  const [isNew, setIsNew] = useState(false)
  function openNew() { setEditing({ id: `preset-${Date.now()}`, name: '', focus: 25, break: 5 }); setIsNew(true) }
  function save() {
    if (!editing || !editing.name.trim() || editing.focus < 1 || editing.focus > 720 || editing.break < 0 || editing.break > 180) return
    setPresets((current) => isNew ? [...current, { ...editing, name: editing.name.trim() }] : current.map((preset) => preset.id === editing.id ? { ...editing, name: editing.name.trim() } : preset))
    setEditing(null); notify(isNew ? 'Preset created' : 'Preset updated')
  }
  function remove(id: string) {
    if (presets.length <= 1) return notify('Keep at least one preset')
    if (!window.confirm('Delete this preset?')) return
    setPresets((current) => current.filter((preset) => preset.id !== id)); notify('Preset deleted')
  }
  return <section className="content-section presets-page"><div className="section-intro"><div><p className="eyebrow">Personal rhythms</p><p className="section-description">Save the sessions that help you get into a flow state.</p></div><button className="primary-button small" onClick={openNew}>＋ New preset</button></div><div className="preset-list">{presets.map((preset) => <div className={`preset-row ${preset.id === selectedPresetId ? 'active-row' : ''}`} key={preset.id} role="button" tabIndex={0} aria-label={`Use ${preset.name} preset`} onClick={() => { changePreset(preset.id); notify(`${preset.name} selected`) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); changePreset(preset.id); notify(`${preset.name} selected`) } }}><div className="preset-symbol">{preset.id === selectedPresetId ? '✓' : '◷'}</div><div className="preset-main"><strong>{preset.name}</strong><span>{preset.focus} min focus <i>·</i> {preset.break} min break</span></div>{preset.id === selectedPresetId && <span className="default-badge">Current</span>}<button className="row-action" onClick={(event) => { event.stopPropagation(); setEditing(preset); setIsNew(false) }}>Edit</button><button className="delete-action" onClick={(event) => { event.stopPropagation(); remove(preset.id) }}>Delete</button></div>)}</div>{editing && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><div><p className="eyebrow">{isNew ? 'New preset' : 'Edit preset'}</p><h2>{isNew ? 'Find your pace.' : 'Tune this session.'}</h2></div><button className="close-button" onClick={() => setEditing(null)}>×</button></div><label>Preset name<input autoFocus value={editing.name} placeholder="Deep work" onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><div className="form-grid"><label>Focus <span className="input-suffix"><input type="number" min="1" max="720" value={editing.focus} onChange={(event) => setEditing({ ...editing, focus: Number(event.target.value) })} /><b>min</b></span></label><label>Break <span className="input-suffix"><input type="number" min="0" max="180" value={editing.break} onChange={(event) => setEditing({ ...editing, break: Number(event.target.value) })} /><b>min</b></span></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" onClick={save}>Save preset</button></div></div></div>}</section>
}

function SettingsPage({ settings, presets, updateSetting, resetAll }: { settings: Settings; presets: Preset[]; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void; resetAll: () => void }) {
  return <section className="content-section settings-page"><div className="settings-layout"><div className="settings-nav"><p className="eyebrow">Preferences</p><button className="settings-nav-active">Timer</button><button>Appearance</button><button>Timer visual</button><button>Sounds</button><button>Behavior</button><button>Data</button></div><div className="settings-content"><SettingGroup title="Timer" description="Set the way a session begins and ends."><SettingRow label="Default timer mode" description="The mode shown when Tempo opens."><select value={settings.defaultMode} onChange={(event) => updateSetting('defaultMode', event.target.value as Mode)}><option value="pomodoro">Pomodoro</option><option value="stopwatch">Stopwatch</option><option value="until">Until</option></select></SettingRow><SettingRow label="Default Pomodoro preset" description="Your starting rhythm for new sessions."><select value={settings.defaultPresetId} onChange={(event) => updateSetting('defaultPresetId', event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.focus}/{preset.break}</option>)}</select></SettingRow><SettingRow label="Automatically start breaks" description="Move into the break without stopping."><Toggle checked={settings.autoStartBreaks} onChange={(value) => updateSetting('autoStartBreaks', value)} /></SettingRow><SettingRow label="Automatically start focus sessions" description="Start the next focus after a break."><Toggle checked={settings.autoStartFocus} onChange={(value) => updateSetting('autoStartFocus', value)} /></SettingRow><SettingRow label="Show seconds" description="Keep seconds visible during countdowns."><Toggle checked={settings.showSeconds} onChange={(value) => updateSetting('showSeconds', value)} /></SettingRow><SettingRow label="Confirm before resetting" description="Prevent accidental resets while running."><Toggle checked={settings.confirmReset} onChange={(value) => updateSetting('confirmReset', value)} /></SettingRow></SettingGroup><SettingGroup title="Appearance" description="A quiet canvas for your attention."><SettingRow label="Color mode" description="Choose light, dark, or follow your system."><div className="segmented">{(['light', 'dark', 'system'] as Appearance[]).map((item) => <button className={settings.appearance === item ? 'selected' : ''} key={item} onClick={() => updateSetting('appearance', item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></SettingRow><SettingRow label="Accent color" description="Used sparingly for progress and focus states."><div className="accent-picker">{accents.map((accent) => <button key={accent.value} aria-label={accent.name} className={settings.accent === accent.value ? 'accent-selected' : ''} style={{ background: accent.value }} onClick={() => updateSetting('accent', accent.value)} />)}<input aria-label="Custom accent color" type="color" value={settings.accent} onChange={(event) => updateSetting('accent', event.target.value)} /></div></SettingRow></SettingGroup><SettingGroup title="Timer visual" description="Choose the way time moves in front of you."><div className="visual-grid">{visualOptions.map((option) => <button className={`visual-option ${settings.visual === option.id ? 'selected' : ''}`} key={option.id} onClick={() => updateSetting('visual', option.id)}><div className={`mini-visual mini-${option.id}`}><span /></div><strong>{option.label}</strong><small>{option.description}</small></button>)}</div></SettingGroup><SettingGroup title="Sounds & behavior" description="Keep the environment supportive and quiet."><SettingRow label="Completion sound" description="A soft cue when a session ends."><Toggle checked={settings.sound} onChange={(value) => updateSetting('sound', value)} /></SettingRow><SettingRow label="Volume" description="Completion sound volume."><input className="range" type="range" min="0" max="100" value={settings.volume} onChange={(event) => updateSetting('volume', Number(event.target.value))} /></SettingRow><SettingRow label="Keep screen awake" description="Request the browser to keep your display awake while running."><Toggle checked={settings.keepAwake} onChange={(value) => updateSetting('keepAwake', value)} /></SettingRow><SettingRow label="Keyboard shortcuts" description="Space start/pause · R reset · 1/2/3 switch modes."><span className="shortcut-list"><kbd>Space</kbd><kbd>R</kbd><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd></span></SettingRow></SettingGroup><SettingGroup title="Data" description="Tempo keeps everything on this device. No account required."><button className="danger-button" onClick={resetAll}>Reset all Tempo settings</button></SettingGroup></div></div></section>
}

function SettingGroup({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <section className="setting-group"><div className="group-heading"><h2>{title}</h2><p>{description}</p></div><div className="setting-rows">{children}</div></section> }
function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><div className="setting-control">{children}</div></div> }
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button> }
function TaskModal({ value, setValue, onClose, onSave }: { value: string; setValue: (value: string) => void; onClose: () => void; onSave: () => void }) { return <div className="modal-backdrop"><div className="modal task-modal"><div className="modal-header"><div><p className="eyebrow">Your intention</p><h2>What will you focus on?</h2></div><button className="close-button" onClick={onClose}>×</button></div><label>Focused task<input autoFocus maxLength={80} value={value} placeholder="Study chapter 4" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave() }} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onSave}>Save task</button></div></div></div> }

export default App
