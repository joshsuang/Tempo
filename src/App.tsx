import { useCallback, useEffect, useMemo, useState, type ReactNode, type CSSProperties } from 'react'
import CommandPalette from './CommandPalette'

type Mode = 'pomodoro' | 'stopwatch' | 'until' | 'countdown'
type Appearance = 'light' | 'dark' | 'system'
type Visual = 'circle' | 'line' | 'tree' | 'dot' | 'orbit' | 'wave' | 'mountain' | 'vertical'
type Page = 'timer' | 'presets' | 'settings'
type SessionPhase = 'focus' | 'break'

type Preset = { id: string; name: string; focus: number; break: number }
type TimerSnapshot = { mode: Mode; phase: SessionPhase; remaining: number; elapsed: number; endAt: number | null; stopwatchStartedAt: number | null; untilDuration: number; countdownDuration: number; running: boolean }
type Completion = { title: string; body: string; pomodoro?: boolean }
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
  clearTaskOnComplete: boolean
  keepTaskAfterComplete: boolean
  completionBehavior: 'choices' | 'auto' | 'stop'
  focusIntensity: 'subtle' | 'focused' | 'immersive'
  miniTimer: boolean
  keepAwake: boolean
  sound: boolean
  volume: number
  rememberLastMode: boolean
  focusMode: boolean
  notifications: boolean
  lastMode: Mode
}
type Persisted = {
  settings: Settings
  presets: Preset[]
  task: string
  selectedPresetId: string
  mode: Mode
  untilTarget: string
  customCountdownMinutes: number
  recentDurations: number[]
  recentTasks: string[]
  recentSessions: { mode: Mode; task: string; duration: number; at: number }[]
  timerSnapshot?: TimerSnapshot
}

const STORAGE_KEY = 'tempo-app-v1'
const accents = [
  { name: 'Indigo', value: '#5b5ce2' },
  { name: 'Terracotta', value: '#c86b52' },
  { name: 'Forest', value: '#3e8b6d' },
  { name: 'Amber', value: '#d28b2f' },
  { name: 'Plum', value: '#8c5ca8' },
]
const countdownQuickPresets = [{ name: 'Short', minutes: 25 }, { name: 'Study', minutes: 50 }, { name: 'Deep focus', minutes: 90 }]
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
  autoStartBreaks: true, autoStartFocus: false, showSeconds: true, confirmReset: true, clearTaskOnComplete: false, keepTaskAfterComplete: true, completionBehavior: 'choices', focusIntensity: 'focused', miniTimer: false, keepAwake: false,
  sound: true, volume: 70, rememberLastMode: true, focusMode: true, notifications: true, lastMode: 'pomodoro',
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
      mode: parsed.mode === 'stopwatch' || parsed.mode === 'until' || parsed.mode === 'countdown' || parsed.mode === 'pomodoro' ? parsed.mode : 'pomodoro',
      untilTarget: typeof parsed.untilTarget === 'string' ? parsed.untilTarget : '17:00',
      customCountdownMinutes: typeof parsed.customCountdownMinutes === 'number' && Number.isFinite(parsed.customCountdownMinutes) ? clamp(parsed.customCountdownMinutes, 1, 720) : 25,
      recentDurations: Array.isArray(parsed.recentDurations) ? parsed.recentDurations.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).map((value) => clamp(value, 1, 720)).slice(0, 5) : [],
      recentTasks: Array.isArray(parsed.recentTasks) ? parsed.recentTasks.filter((value): value is string => typeof value === 'string').slice(0, 5) : [],
      recentSessions: Array.isArray(parsed.recentSessions) ? parsed.recentSessions.slice(0, 5) : [],
      timerSnapshot: parsed.timerSnapshot,
    }
  } catch {
    return { settings: initialSettings, presets: initialPresets, task: '', selectedPresetId: 'deep-work', mode: 'pomodoro', untilTarget: '17:00', customCountdownMinutes: 25, recentDurations: [], recentTasks: [], recentSessions: [] }
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
const parseDuration = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/\s+/g, '')
  if (!normalized) return 0
  if (/^\d+$/.test(normalized)) return clamp(Number(normalized), 1, 720)
  const hours = Number(normalized.match(/(\d+(?:\.\d+)?)h/)?.[1] ?? 0)
  const minutes = Number(normalized.match(/(\d+)m/)?.[1] ?? 0)
  const total = Math.round(hours * 60 + minutes)
  return total > 0 ? clamp(total, 1, 720) : 0
}
const formatUntil = (seconds: number, showSeconds = true) => {
  const safe = Math.max(0, Math.floor(seconds))
  if (safe < 60) return formatClock(safe, true)
  if (safe >= 3600 || !showSeconds) return `${Math.floor(safe / 60)} min`
  return formatClock(safe, true)
}
const modeName = (mode: Mode) => mode === 'pomodoro' ? 'Pomodoro' : mode === 'stopwatch' ? 'Stopwatch' : mode === 'until' ? 'Until' : 'Countdown'

function App() {
  const saved = useMemo(readStorage, [])
  const [page, setPage] = useState<Page>('timer')
  const [settings, setSettings] = useState<Settings>(saved.settings)
  const [presets, setPresets] = useState<Preset[]>(saved.presets)
  const [task, setTask] = useState(saved.task)
  const [recentTasks, setRecentTasks] = useState<string[]>(saved.recentTasks)
  const [recentDurations, setRecentDurations] = useState<number[]>(saved.recentDurations)
  const [recentSessions, setRecentSessions] = useState(saved.recentSessions)
  const [mode, setMode] = useState<Mode>(settings.rememberLastMode ? saved.mode : settings.defaultMode)
  const [selectedPresetId, setSelectedPresetId] = useState(saved.selectedPresetId)
  const [untilTarget, setUntilTarget] = useState(saved.untilTarget)
  const [customCountdownMinutes, setCustomCountdownMinutes] = useState(saved.customCountdownMinutes)
  const [countdownInput, setCountdownInput] = useState(`${saved.customCountdownMinutes}m`)
  const selectedPreset = presets.find((preset) => preset.id === selectedPresetId) ?? presets[0]
  const snapshot = saved.timerSnapshot
  const [phase, setPhase] = useState<SessionPhase>(snapshot?.phase ?? 'focus')
  const [remaining, setRemaining] = useState(snapshot?.running ? snapshot.remaining : saved.mode === 'countdown' ? saved.customCountdownMinutes * 60 : selectedPreset.focus * 60)
  const [elapsed, setElapsed] = useState(snapshot?.elapsed ?? 0)
  const [running, setRunning] = useState(false)
  const [resumeAvailable, setResumeAvailable] = useState(Boolean(snapshot?.running))
  const [endAt, setEndAt] = useState<number | null>(snapshot?.endAt ?? null)
  const [stopwatchStartedAt, setStopwatchStartedAt] = useState<number | null>(snapshot?.stopwatchStartedAt ?? null)
  const [untilDuration, setUntilDuration] = useState(snapshot?.untilDuration ?? 0)
  const [countdownDuration, setCountdownDuration] = useState(snapshot?.countdownDuration ?? saved.customCountdownMinutes * 60)
  const [completion, setCompletion] = useState<Completion | null>(null)
  const [showTaskEditor, setShowTaskEditor] = useState(false)
  const [taskDraft, setTaskDraft] = useState(task)
  const [message, setMessage] = useState('')
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  useEffect(() => {
    if (resumeAvailable) return
    const timerSnapshot: TimerSnapshot = { mode, phase, remaining, elapsed, endAt, stopwatchStartedAt, untilDuration, countdownDuration, running }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ settings, presets, task, selectedPresetId, mode, untilTarget, customCountdownMinutes, recentDurations, recentTasks, recentSessions, timerSnapshot } satisfies Persisted))
  }, [settings, presets, task, selectedPresetId, mode, untilTarget, customCountdownMinutes, recentDurations, recentTasks, recentSessions, phase, remaining, elapsed, endAt, stopwatchStartedAt, untilDuration, countdownDuration, running, resumeAvailable])

  const getUntilSeconds = useCallback(() => {
    const [hours, minutes] = untilTarget.split(':').map(Number)
    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 0
    const now = new Date()
    const target = new Date(now)
    target.setHours(hours, minutes, 0, 0)
    return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
  }, [untilTarget])

  useEffect(() => {
    if (mode === 'until' && !running) setRemaining(getUntilSeconds())
  }, [mode, untilTarget, running, getUntilSeconds])

  const syncTimer = useCallback((now = Date.now()) => {
    if (!running) return
    if (mode === 'stopwatch') {
      if (stopwatchStartedAt !== null) setElapsed(Math.max(0, Math.floor((now - stopwatchStartedAt) / 1000)))
      return
    }
    if (mode === 'countdown') {
      if (endAt === null) return
      const next = Math.max(0, Math.ceil((endAt - now) / 1000))
      if (next <= 0) {
        if (settings.sound) playCompletionSound(settings.volume)
        notifyDesktop('Countdown complete', task || 'Your countdown has finished')
        setRemaining(0); setRunning(false); setEndAt(null); recordSession(countdownDuration); setCompletion(settings.completionBehavior === 'choices' ? { title: 'Countdown complete', body: task || 'Your countdown has finished' } : null)
      } else {
        setRemaining(next)
      }
      return
    }
    if (mode === 'until') {
      const next = getUntilSeconds()
      setRemaining((value) => {
        if (value > 0 && next <= 0) {
          notifyDesktop('Until timer complete', task || 'Your target time has arrived')
          recordSession(untilDuration); setCompletion(settings.completionBehavior === 'choices' ? { title: 'Until time reached', body: task || 'Your target time has arrived' } : null)
          setRunning(false)
          setEndAt(null)
        }
        return next
      })
      return
    }
    if (endAt === null) return
    let nextPhase = phase
    let nextEnd = endAt
    let nextDuration = nextPhase === 'focus' ? selectedPreset.focus * 60 : selectedPreset.break * 60
    while (now >= nextEnd) {
      if (settings.sound) playCompletionSound(settings.volume)
      nextPhase = nextPhase === 'focus' ? 'break' : 'focus'
      nextDuration = nextPhase === 'focus' ? selectedPreset.focus * 60 : selectedPreset.break * 60
      const title = nextPhase === 'break' ? 'Focus complete · Break starting' : 'Break complete · Focus starting'
      notifyDesktop(title, task || `${selectedPreset.name} session`)
      nextEnd += nextDuration * 1000
      const shouldContinue = settings.completionBehavior === 'auto' || (nextPhase === 'break' && settings.autoStartBreaks) || (nextPhase === 'focus' && settings.autoStartFocus)
      if (!shouldContinue) {
        setPhase(nextPhase); setRemaining(nextDuration); setRunning(false); setEndAt(null); recordSession(nextPhase === 'break' ? selectedPreset.focus * 60 : selectedPreset.break * 60); setCompletion(settings.completionBehavior === 'choices' ? { title: nextPhase === 'break' ? 'Focus session complete' : 'Break complete', body: nextPhase === 'break' ? 'Your break is ready when you are.' : 'Start another focus session when you are ready.', pomodoro: true } : null)
        return
      }
    }
    setPhase(nextPhase)
    setEndAt(nextEnd)
    setRemaining(Math.max(0, Math.ceil((nextEnd - now) / 1000)))
  }, [running, mode, phase, endAt, stopwatchStartedAt, selectedPreset, settings.autoStartBreaks, settings.autoStartFocus, settings.sound, settings.volume, settings.completionBehavior, settings.clearTaskOnComplete, getUntilSeconds, task, recordSession])

  useEffect(() => {
    if (!running) return
    syncTimer()
    const interval = window.setInterval(() => syncTimer(), 1000)
    return () => window.clearInterval(interval)
  }, [running, syncTimer])

  useEffect(() => {
    const handleVisibility = () => { if (!document.hidden) syncTimer() }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [syncTimer])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const isTextField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (event.key === 'Enter') {
        if (showTaskEditor) {
          if (isTextField) return
          event.preventDefault()
          saveTask()
          return
        }
        if (!isTextField) {
          event.preventDefault()
          openTaskEditor()
          return
        }
      }
      if (isTextField) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setCommandPaletteOpen(true); return }
      if (event.key === 'Escape') { setCommandPaletteOpen(false); return }
      if (event.code === 'Space') { event.preventDefault(); toggleTimer() }
      if (event.key === '+' || event.key === '=') { event.preventDefault(); adjustTime(5); return }
      if (event.key === '-') { event.preventDefault(); adjustTime(-5); return }
      if (event.key.toLowerCase() === 'r') resetTimer()
      if (event.key.toLowerCase() === 'e') { event.preventDefault(); setTaskDraft(task); setShowTaskEditor(true) }
      if (event.key === '1') changeMode('pomodoro')
      if (event.key === '2') changeMode('stopwatch')
      if (event.key === '3') changeMode('until')
      if (event.key === '4') changeMode('countdown')
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

  const totalDuration = mode === 'pomodoro' ? (phase === 'focus' ? selectedPreset.focus : selectedPreset.break) * 60 : mode === 'until' ? Math.max(1, untilDuration || getUntilSeconds()) : mode === 'countdown' ? Math.max(1, countdownDuration || customCountdownMinutes * 60) : Math.max(1, elapsed)
  const progress = mode === 'stopwatch' ? Math.min(1, elapsed / (60 * 60)) : totalDuration ? (totalDuration - remaining) / totalDuration : 0
  const displayTime = mode === 'stopwatch' ? formatClock(elapsed, true) : mode === 'until' ? formatUntil(remaining, settings.showSeconds) : formatClock(remaining, settings.showSeconds || remaining < 60)

  useEffect(() => {
    if (!running) {
      document.title = 'Tempo'
      return
    }
    const taskSuffix = task.trim() ? ` · ${task.trim()}` : ''
    document.title = `${displayTime}${taskSuffix} — Tempo`
  }, [displayTime, task, running])

  function requestNotifications() {
    if (!settings.notifications || !('Notification' in window)) return
    if (Notification.permission === 'default') Notification.requestPermission().catch(() => undefined)
  }
  function notifyDesktop(title: string, body: string) {
    if (!settings.notifications || !('Notification' in window) || Notification.permission !== 'granted') return
    new Notification(title, { body, icon: '/tempo-icon.svg', tag: 'tempo-timer' })
  }
  function changeMode(next: Mode) {
    setCompletion(null); setResumeAvailable(false); setRunning(false); setEndAt(null); setStopwatchStartedAt(null); setUntilDuration(0); setCountdownDuration(customCountdownMinutes * 60); setMode(next); setPhase('focus'); setElapsed(0)
    setRemaining(next === 'pomodoro' ? selectedPreset.focus * 60 : next === 'until' ? getUntilSeconds() : next === 'countdown' ? customCountdownMinutes * 60 : 0)
    setPage('timer')
  }
  function toggleTimer() {
    setCompletion(null); setResumeAvailable(false)
    const now = Date.now()
    if (running) {
      syncTimer(now)
      setRunning(false); setEndAt(null); setStopwatchStartedAt(null)
      return
    }
    if (mode === 'pomodoro' || mode === 'countdown') setEndAt(now + Math.max(0, remaining) * 1000)
    if (mode === 'until') setUntilDuration(Math.max(1, remaining))
    if (mode === 'stopwatch') setStopwatchStartedAt(now - elapsed * 1000)
    setRunning(true)
    requestNotifications()
  }
  function changePreset(id: string) {
    const next = presets.find((preset) => preset.id === id)
    if (!next) return
    setRunning(false); setEndAt(null); setStopwatchStartedAt(null); setUntilDuration(0); setSelectedPresetId(id); setPhase('focus'); setRemaining(next.focus * 60)
  }
  function resetTimer() {
    setCompletion(null); setResumeAvailable(false)
    if (settings.confirmReset && running && !window.confirm('Reset the current timer?')) return
    setRunning(false); setEndAt(null); setStopwatchStartedAt(null); setUntilDuration(0); setCountdownDuration(customCountdownMinutes * 60); setPhase('focus'); setElapsed(0)
    setRemaining(mode === 'pomodoro' ? selectedPreset.focus * 60 : mode === 'until' ? getUntilSeconds() : mode === 'countdown' ? customCountdownMinutes * 60 : 0)
  }
  function openTaskEditor() { setTaskDraft(task); setShowTaskEditor(true) }
  function saveTask() {
    const nextTask = taskDraft.trim()
    setTask(nextTask)
    if (nextTask) setRecentTasks((current) => [nextTask, ...current.filter((item) => item !== nextTask)].slice(0, 5))
    setShowTaskEditor(false)
  }
  function clearTask() { setTask(''); setTaskDraft(''); setShowTaskEditor(false) }
  function recordSession(duration: number) {
    setRecentSessions((current) => [{ mode, task, duration, at: Date.now() }, ...current].slice(0, 5))
    if (settings.clearTaskOnComplete) { setTask(''); setTaskDraft('') }
  }
  function repeatSession() {
    setCompletion(null); setResumeAvailable(false); setRunning(false); setElapsed(0); setPhase('focus')
    const duration = mode === 'pomodoro' ? selectedPreset.focus * 60 : mode === 'countdown' ? customCountdownMinutes * 60 : mode === 'until' ? getUntilSeconds() : 0
    setRemaining(duration); setCountdownDuration(duration)
    if (mode === 'stopwatch') setStopwatchStartedAt(Date.now())
    else if (mode !== 'until') setEndAt(Date.now() + Math.max(1, duration) * 1000)
    setRunning(true); requestNotifications()
  }
  function resumeSavedTimer() { setResumeAvailable(false); setCompletion(null); setRunning(true) }
  function dismissResume() { setResumeAvailable(false); resetTimer() }
  function adjustTime(minutes: number) {
    if (mode === 'until' || mode === 'stopwatch') return
    const next = Math.max(0, remaining + minutes * 60)
    setRemaining(next)
    if (mode === 'countdown') { setCountdownDuration((value) => Math.max(60, value + minutes * 60)); if (running) setEndAt(Date.now() + next * 1000) }
    if (mode === 'pomodoro' && running) setEndAt(Date.now() + next * 1000)
  }
  function previewSound() { playCompletionSound(settings.volume) }
  function requestNotificationPermission() { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => undefined) }
  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) { setSettings((current) => ({ ...current, [key]: value })) }
  function notify(text: string) { setMessage(text); window.setTimeout(() => setMessage(''), 2200) }
  function exportData() {
    const raw = localStorage.getItem(STORAGE_KEY) ?? '{}'; const blob = new Blob([raw], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'tempo-backup.json'; link.click(); URL.revokeObjectURL(url)
  }
  function importData() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json'; input.onchange = () => { const file = input.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => { try { const parsed = JSON.parse(String(reader.result)); if (!parsed || typeof parsed !== 'object') throw new Error('invalid'); localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed)); window.location.reload() } catch { notify('That Tempo backup is not valid') } }; reader.readAsText(file) }; input.click()
  }
  function resetAll() {
    if (!window.confirm('Reset all Tempo settings, presets, and task?')) return
    localStorage.removeItem(STORAGE_KEY); window.location.reload()
  }

  return <div className={`app-shell ${settings.focusMode ? 'focus-layout' : ''} ${running && settings.focusMode ? `focus-mode focus-${settings.focusIntensity}` : ''} ${settings.miniTimer ? 'mini-timer' : ''}`}>
    <main className="main-content">
      <header className={`topbar ${page === 'timer' ? 'timer-topbar' : ''}`}>
        <button className="brand" aria-label="Go to Timer" onClick={() => setPage('timer')}><img className="brand-mark" src="/tempo-icon.svg" alt="" /><span>tempo</span></button>
        {page === 'settings' && <div className="topbar-heading"><p className="eyebrow">Tempo</p><h1>Make it yours.</h1></div>}
        <div className="top-actions"><button className="command-trigger" aria-label="Open command palette" onClick={() => setCommandPaletteOpen(true)}>⌘K</button><button className={`settings-link ${page === 'settings' ? 'active' : ''}`} aria-label="Open Settings" onClick={() => setPage('settings')}>⚙</button><button className="icon-button" aria-label="Toggle appearance" onClick={() => updateSetting('appearance', settings.appearance === 'dark' ? 'light' : 'dark')}>{settings.appearance === 'dark' ? '☼' : '◐'}</button></div>
      </header>

      {page === 'timer' && <TimerPage {...{ resumeAvailable, onResume: resumeSavedTimer, onDismissResume: dismissResume, completion, onCompletionDone: () => setCompletion(null), onRepeat: repeatSession, onCompletionStart: (focus = false) => { setCompletion(null); if (focus && mode === 'pomodoro') { setPhase('focus'); setRemaining(selectedPreset.focus * 60); setEndAt(Date.now() + selectedPreset.focus * 60 * 1000) } else if (mode !== 'pomodoro') { const next = remaining + 300; setRemaining(next); setCountdownDuration(next); setEndAt(Date.now() + next * 1000) } else { setEndAt(Date.now() + Math.max(1, remaining) * 1000) } setRunning(true) }, mode, changeMode, selectedPreset, selectedPresetId, changePreset, presets, phase, remaining, elapsed, running, toggleTimer, resetTimer, displayTime, progress, task, setShowTaskEditor, openTaskEditor, clearTask, adjustTime, settings, untilTarget, setUntilTarget, getUntilSeconds, customCountdownMinutes, countdownInput, recentDurations, setCountdownInput, setCustomCountdownMinutes: (minutes: number) => { const safe = clamp(minutes, 1, 720); setCustomCountdownMinutes(safe); setCountdownInput(`${safe}m`); setRecentDurations((current) => [safe, ...current.filter((item) => item !== safe)].slice(0, 5)); if (!running && mode === 'countdown') { setRemaining(safe * 60); setCountdownDuration(safe * 60) } } }} />}
      {page === 'settings' && <SettingsPage onExport={exportData} onImport={importData} recentSessions={recentSessions} onTestSound={previewSound} onRequestNotifications={requestNotificationPermission} settings={settings} presets={presets} setPresets={setPresets} selectedPresetId={selectedPresetId} changePreset={changePreset} notify={notify} updateSetting={updateSetting} resetAll={resetAll} onClose={() => setPage('timer')} />}
      {showTaskEditor && <TaskModal value={taskDraft} setValue={setTaskDraft} recentTasks={recentTasks} onUseTemplate={setTaskDraft} onClose={() => setShowTaskEditor(false)} onSave={saveTask} />}
      {message && <div className="toast">{message}</div>}
      <CommandPalette open={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} mode={mode} running={running} onStartPause={toggleTimer} onReset={resetTimer} onMode={changeMode} onSettings={() => { setPage('settings'); setCommandPaletteOpen(false) }} onAdjustTime={adjustTime} onEditTask={openTaskEditor} onClearTask={clearTask} onAppearance={() => updateSetting('appearance', settings.appearance === 'dark' ? 'light' : 'dark')} />
    </main>
  </div>
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span>{label}{active && <span className="nav-indicator" />}</button>
}

type TimerPageProps = {
  resumeAvailable: boolean; onResume: () => void; onDismissResume: () => void; completion: Completion | null; onCompletionDone: () => void; onCompletionStart: (focus?: boolean) => void; onRepeat: () => void;
  mode: Mode; changeMode: (mode: Mode) => void; selectedPreset: Preset; selectedPresetId: string; changePreset: (id: string) => void; presets: Preset[]; phase: SessionPhase; remaining: number; elapsed: number; running: boolean; toggleTimer: () => void; resetTimer: () => void; displayTime: string; progress: number; task: string; setShowTaskEditor: (value: boolean) => void; openTaskEditor: () => void; clearTask: () => void; adjustTime: (minutes: number) => void; settings: Settings; untilTarget: string; setUntilTarget: (value: string) => void; getUntilSeconds: () => number; customCountdownMinutes: number; countdownInput: string; recentDurations: number[]; setCountdownInput: (value: string) => void; setCustomCountdownMinutes: (minutes: number) => void
}
function TimerPage(props: TimerPageProps) {
  const { resumeAvailable, onResume, onDismissResume, completion, onCompletionDone, onCompletionStart, onRepeat, mode, changeMode, selectedPreset, selectedPresetId, changePreset, presets, phase, remaining, running, toggleTimer, resetTimer, displayTime, progress, task, openTaskEditor, clearTask, adjustTime, settings, untilTarget, setUntilTarget, getUntilSeconds, customCountdownMinutes, countdownInput, recentDurations, setCountdownInput, setCustomCountdownMinutes } = props
  const phaseLabel = mode === 'pomodoro' ? (phase === 'focus' ? 'Focus session' : 'Break time') : mode === 'stopwatch' ? 'Open-ended' : mode === 'until' ? 'Until your target' : 'Custom countdown'
  return <section className="timer-page">
    {resumeAvailable && <div className="resume-card" role="dialog" aria-label="Resume previous timer"><div><strong>Resume your previous session?</strong><span>The timer was active when Tempo was closed.</span></div><div className="resume-actions"><button className="secondary-button" onClick={onDismissResume}>Discard</button><button className="primary-button" onClick={onResume}>Resume</button></div></div>}
    {completion && <div className="completion-card" role="status" aria-live="polite"><div><strong>{completion.title}</strong><span>{completion.body}</span></div><div className="completion-actions">{completion.pomodoro && <><button className="primary-button small" onClick={() => onCompletionStart(false)}>Start break</button><button className="secondary-button small" onClick={() => onCompletionStart(true)}>Start focus</button></>}<button className="secondary-button small" onClick={onRepeat}>Repeat</button>{!completion.pomodoro && mode === 'countdown' && <button className="primary-button small" onClick={() => onCompletionStart()}>Add 5 min</button>}<button className="secondary-button small" onClick={onCompletionDone}>Done</button></div></div>}
    <div className="mode-tabs" role="tablist" aria-label="Timer modes">{(['pomodoro', 'stopwatch', 'until', 'countdown'] as Mode[]).map((item) => <button key={item} className={mode === item ? 'selected' : ''} onClick={() => changeMode(item)}>{modeName(item)}</button>)}</div>
    <div className="timer-stage">
      <div className="stage-meta"><span className={`status-dot ${running ? 'live' : ''}`} />{running ? 'In progress' : 'Ready when you are'}</div>
      <div className="timer-heading"><span>{phaseLabel}{mode === 'until' && <> <button className="edit-until-button" onClick={() => { if (running) toggleTimer(); }} aria-label="Edit Until timer">(Edit timer)</button></>}</span>{mode === 'pomodoro' && <span className="session-count">{selectedPreset.focus}/{selectedPreset.break} min</span>}</div>
      {mode === 'pomodoro' && <div className="session-context"><div><div className="preset-button-list" role="listbox" aria-label="Pomodoro presets">{presets.map((preset) => <button type="button" role="option" aria-selected={preset.id === selectedPresetId} className={`preset-pill ${preset.id === selectedPresetId ? 'chosen' : ''}`} key={preset.id} onClick={() => changePreset(preset.id)}><span>{preset.name}</span><small>{preset.focus}/{preset.break}</small></button>)}</div></div><div className="next-up-inline"><strong>{phase === 'focus' ? `Break · ${selectedPreset.break} min` : `Focus · ${selectedPreset.focus} min`}</strong></div></div>}
      {mode === 'until' && <div className="until-picker"><label htmlFor="until-target">UNTIL</label><input id="until-target" aria-label="Set target time" type="time" value={untilTarget} onChange={(event) => setUntilTarget(event.target.value)} /><span>{getUntilSeconds() > 0 ? `${Math.ceil(getUntilSeconds() / 60)} min remaining` : 'Choose a future time'}</span></div>}
      {mode === 'countdown' && <div className="countdown-picker"><label htmlFor="countdown-minutes">COUNT DOWN FROM</label><div className="countdown-input"><input id="countdown-minutes" aria-label="Custom countdown duration" type="text" inputMode="text" placeholder="45m or 1h 20m" value={countdownInput} disabled={running} onChange={(event) => { setCountdownInput(event.target.value); const parsed = parseDuration(event.target.value); if (parsed) setCustomCountdownMinutes(parsed) }} /><span>minutes</span></div><small>Try 45m or 1h 20m</small><div className="recent-duration-list" aria-label="Countdown presets">{countdownQuickPresets.map((preset) => <button type="button" key={preset.name} onClick={() => setCustomCountdownMinutes(preset.minutes)}>{preset.name} · {preset.minutes}m</button>)}{recentDurations.map((duration) => <button type="button" key={`recent-${duration}`} onClick={() => setCustomCountdownMinutes(duration)}>Recent · {duration}m</button>)}</div></div>}
      <TimerVisual visual={settings.visual} progress={progress} running={running} accent={settings.accent} />
      <div className="timer-readout" aria-live="polite">{displayTime}</div>
      <div className="timer-controls"><div className="time-adjustments" aria-label="Adjust timer duration"><button type="button" aria-label="Remove 10 minutes" title="Remove 10 minutes" onClick={() => adjustTime(-10)} disabled={mode === 'until' || mode === 'stopwatch' || remaining <= 0}>−10</button><button type="button" aria-label="Remove 5 minutes" title="Remove 5 minutes" onClick={() => adjustTime(-5)} disabled={mode === 'until' || mode === 'stopwatch' || remaining <= 0}>−5</button></div><button className="primary-button" aria-label={running ? 'Pause timer' : 'Start timer'} onClick={toggleTimer}><span>{running ? 'Ⅱ' : '▶'}</span><em>{running ? 'Pause' : 'Start'}</em></button><button className="secondary-button" aria-label="Reset timer" onClick={resetTimer}><span className="reset-icon">↻</span><em>Reset</em> <span className="shortcut">R</span></button><div className="time-adjustments" aria-label="Add time to timer"><button type="button" aria-label="Add 5 minutes" title="Add 5 minutes" onClick={() => adjustTime(5)} disabled={mode === 'until' || mode === 'stopwatch'}>+5</button><button type="button" aria-label="Add 10 minutes" title="Add 10 minutes" onClick={() => adjustTime(10)} disabled={mode === 'until' || mode === 'stopwatch'}>+10</button></div></div>
      <div className="task-row"><div className="task-icon">⌁</div><div className="task-copy">{task ? <><span className="task-label">FOCUSING ON</span><strong>{task}</strong></> : <span className="empty-task">What are you focusing on?</span>}</div><div className="task-actions"><button className="task-action edit-task" aria-label={task ? 'Edit focused task' : 'Add focused task'} title={`${task ? 'Edit' : 'Add'} task (E)`} onClick={openTaskEditor}>✎</button><button className="task-action clear-task" aria-label="Clear focused task" title="Clear task" onClick={clearTask} disabled={!task}>×</button></div></div>
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

function PresetsPage({ presets, setPresets, selectedPresetId, changePreset, notify, embedded = false }: { presets: Preset[]; setPresets: (value: Preset[] | ((value: Preset[]) => Preset[])) => void; selectedPresetId: string; changePreset: (id: string) => void; notify: (message: string) => void; embedded?: boolean }) {
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
  return <section id={embedded ? 'settings-presets' : undefined} className={`content-section presets-page ${embedded ? 'embedded-presets' : ''}`}><div className="section-intro"><div><p className="eyebrow">Personal rhythms</p><p className="section-description">Save the sessions that help you get into a flow state.</p></div><button className="primary-button small" onClick={openNew}>＋ New preset</button></div><div className="preset-list">{presets.map((preset) => <div className={`preset-row ${preset.id === selectedPresetId ? 'active-row' : ''}`} key={preset.id} role="button" tabIndex={0} aria-label={`Use ${preset.name} preset`} onClick={() => { changePreset(preset.id); notify(`${preset.name} selected`) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); changePreset(preset.id); notify(`${preset.name} selected`) } }}><div className="preset-symbol">{preset.id === selectedPresetId ? '✓' : '◷'}</div><div className="preset-main"><strong>{preset.name}</strong><span>{preset.focus} min focus <i>·</i> {preset.break} min break</span></div>{preset.id === selectedPresetId && <span className="default-badge">Current</span>}<button className="row-action" onClick={(event) => { event.stopPropagation(); setEditing(preset); setIsNew(false) }}>Edit</button><button className="delete-action" onClick={(event) => { event.stopPropagation(); remove(preset.id) }}>Delete</button></div>)}</div>{editing && <div className="modal-backdrop"><div className="modal"><div className="modal-header"><div><p className="eyebrow">{isNew ? 'New preset' : 'Edit preset'}</p><h2>{isNew ? 'Find your pace.' : 'Tune this session.'}</h2></div><button className="close-button" onClick={() => setEditing(null)}>×</button></div><label>Preset name<input autoFocus value={editing.name} placeholder="Deep work" onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><div className="form-grid"><label>Focus <span className="input-suffix"><input type="number" min="1" max="720" value={editing.focus} onChange={(event) => setEditing({ ...editing, focus: Number(event.target.value) })} /><b>min</b></span></label><label>Break <span className="input-suffix"><input type="number" min="0" max="180" value={editing.break} onChange={(event) => setEditing({ ...editing, break: Number(event.target.value) })} /><b>min</b></span></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" onClick={save}>Save preset</button></div></div></div>}</section>
}

function SettingsPage({ onExport, onImport, recentSessions, onTestSound, onRequestNotifications, settings, presets, setPresets, selectedPresetId, changePreset, notify, updateSetting, resetAll, onClose }: { onExport: () => void; onImport: () => void; recentSessions: { mode: Mode; task: string; duration: number; at: number }[]; onTestSound: () => void; onRequestNotifications: () => void; settings: Settings; presets: Preset[]; setPresets: (value: Preset[] | ((value: Preset[]) => Preset[])) => void; selectedPresetId: string; changePreset: (id: string) => void; notify: (message: string) => void; updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void; resetAll: () => void; onClose: () => void }) {
  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return <section className="content-section settings-page"><div className="settings-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onClose}>Save</button></div><div className="settings-layout"><div className="settings-nav"><p className="eyebrow">Preferences</p><button className="settings-nav-active" onClick={() => jumpTo('settings-timer')}>Timer</button><button onClick={() => jumpTo('settings-presets')}>Presets</button><button onClick={() => jumpTo('settings-appearance')}>Appearance</button><button onClick={() => jumpTo('settings-visual')}>Timer visual</button><button onClick={() => jumpTo('settings-sounds')}>Sounds</button><button onClick={() => jumpTo('settings-behavior')}>Behavior</button><button onClick={() => jumpTo('settings-data')}>Data</button></div><div className="settings-content"><SettingGroup id="settings-timer" title="Timer" description="Set the way a session begins and ends."><SettingRow label="Default timer mode" description="The mode shown when Tempo opens."><select value={settings.defaultMode} onChange={(event) => updateSetting('defaultMode', event.target.value as Mode)}><option value="pomodoro">Pomodoro</option><option value="stopwatch">Stopwatch</option><option value="until">Until</option><option value="countdown">Countdown</option></select></SettingRow><SettingRow label="Default Pomodoro preset" description="Your starting rhythm for new sessions."><select value={settings.defaultPresetId} onChange={(event) => updateSetting('defaultPresetId', event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name} · {preset.focus}/{preset.break}</option>)}</select></SettingRow><SettingRow label="Automatically start breaks" description="Move into the break without stopping."><Toggle checked={settings.autoStartBreaks} onChange={(value) => updateSetting('autoStartBreaks', value)} /></SettingRow><SettingRow label="Automatically start focus sessions" description="Start the next focus after a break."><Toggle checked={settings.autoStartFocus} onChange={(value) => updateSetting('autoStartFocus', value)} /></SettingRow><SettingRow label="Show seconds" description="Keep seconds visible during countdowns."><Toggle checked={settings.showSeconds} onChange={(value) => updateSetting('showSeconds', value)} /></SettingRow><SettingRow label="Confirm before resetting" description="Prevent accidental resets while running."><Toggle checked={settings.confirmReset} onChange={(value) => updateSetting('confirmReset', value)} /></SettingRow><SettingRow label="Focus mode visuals" description="Dim and blur surrounding UI while a timer is running."><Toggle checked={settings.focusMode} onChange={(value) => updateSetting('focusMode', value)} /></SettingRow><SettingRow label="Focus intensity" description="Choose how strongly the surrounding interface recedes."><select value={settings.focusIntensity} onChange={(event) => updateSetting('focusIntensity', event.target.value as Settings['focusIntensity'])}><option value="subtle">Subtle</option><option value="focused">Focused</option><option value="immersive">Immersive</option></select></SettingRow><SettingRow label="Mini timer mode" description="Keep only the timer and task in a compact window."><Toggle checked={settings.miniTimer} onChange={(value) => updateSetting('miniTimer', value)} /></SettingRow><SettingRow label="Task after completion" description="Choose whether Tempo keeps or clears your task."><div className="segmented"><button className={settings.clearTaskOnComplete ? 'selected' : ''} onClick={() => { updateSetting('clearTaskOnComplete', true); updateSetting('keepTaskAfterComplete', false) }}>Clear</button><button className={!settings.clearTaskOnComplete ? 'selected' : ''} onClick={() => { updateSetting('clearTaskOnComplete', false); updateSetting('keepTaskAfterComplete', true) }}>Keep</button></div></SettingRow><SettingRow label="Completion behavior" description="Choose what happens when a timer ends."><select value={settings.completionBehavior} onChange={(event) => updateSetting('completionBehavior', event.target.value as Settings['completionBehavior'])}><option value="choices">Show choices</option><option value="auto">Auto-start next phase</option><option value="stop">Stop and wait</option></select></SettingRow><SettingRow label="Desktop notifications" description="Notify you when focus, breaks, or target times end."><Toggle checked={settings.notifications} onChange={(value) => updateSetting('notifications', value)} /></SettingRow></SettingGroup><PresetsPage presets={presets} setPresets={setPresets} selectedPresetId={selectedPresetId} changePreset={changePreset} notify={notify} embedded /><SettingGroup id="settings-appearance" title="Appearance" description="A quiet canvas for your attention."><SettingRow label="Color mode" description="Choose light, dark, or follow your system."><div className="segmented">{(['light', 'dark', 'system'] as Appearance[]).map((item) => <button className={settings.appearance === item ? 'selected' : ''} key={item} onClick={() => updateSetting('appearance', item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div></SettingRow><SettingRow label="Accent color" description="Used sparingly for progress and focus states."><div className="accent-picker">{accents.map((accent) => <button key={accent.value} aria-label={accent.name} className={settings.accent === accent.value ? 'accent-selected' : ''} style={{ background: accent.value }} onClick={() => updateSetting('accent', accent.value)} />)}<input aria-label="Custom accent color" type="color" value={settings.accent} onChange={(event) => updateSetting('accent', event.target.value)} /></div></SettingRow></SettingGroup><SettingGroup id="settings-visual" title="Timer visual" description="Choose the way time moves in front of you."><div className="visual-grid">{visualOptions.map((option) => <button className={`visual-option ${settings.visual === option.id ? 'selected' : ''}`} key={option.id} onClick={() => updateSetting('visual', option.id)}><div className={`mini-visual mini-${option.id}`}><span /></div><strong>{option.label}</strong><small>{option.description}</small></button>)}</div></SettingGroup><SettingGroup id="settings-sounds" title="Sounds & behavior" description="Keep the environment supportive and quiet."><span id="settings-behavior" className="settings-anchor" /><SettingRow label="Completion sound" description="A soft cue when a session ends."><div className="sound-control"><Toggle checked={settings.sound} onChange={(value) => updateSetting('sound', value)} /><button className="preview-button" onClick={onTestSound}>Test sound</button></div></SettingRow><SettingRow label="Volume" description="Completion sound volume."><input className="range" type="range" min="0" max="100" value={settings.volume} onChange={(event) => updateSetting('volume', Number(event.target.value))} /></SettingRow><SettingRow label="Keep screen awake" description="Request the browser to keep your display awake while running."><Toggle checked={settings.keepAwake} onChange={(value) => updateSetting('keepAwake', value)} /></SettingRow><SettingRow label="Notification permission" description={typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'Desktop notifications are enabled.' : 'Allow Tempo to notify you when a session ends.'}><button className="preview-button" onClick={onRequestNotifications}>{typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'Enabled' : 'Enable notifications'}</button></SettingRow><SettingRow label="Keyboard shortcuts" description="Space start/pause · +/− adjust 5 min · Enter edit/save task · R reset · E edit task · 1/2/3/4 switch modes."><span className="shortcut-list"><kbd>+</kbd><kbd>−</kbd><kbd>Enter</kbd><kbd>R</kbd><kbd>E</kbd><kbd>1</kbd><kbd>2</kbd><kbd>3</kbd><kbd>4</kbd></span></SettingRow></SettingGroup><SettingGroup id="settings-data" title="Data" description="Tempo keeps everything on this device. No account required."><div className="data-actions"><button className="preview-button" onClick={onExport}>Export Tempo data</button><button className="preview-button" onClick={onImport}>Import Tempo data</button></div>{recentSessions.length > 0 && <div className="recent-sessions"><strong>Recent sessions</strong>{recentSessions.map((session) => <span key={session.at}>{modeName(session.mode)} · {session.task || 'Untitled'} · {Math.round(session.duration / 60)} min</span>)}</div>}<button className="danger-button" onClick={resetAll}>Reset all Tempo settings</button></SettingGroup></div></div></section>
}

function SettingGroup({ id, title, description, children }: { id?: string; title: string; description: string; children: ReactNode }) { return <section id={id} className="setting-group"><div className="group-heading"><h2>{title}</h2><p>{description}</p></div><div className="setting-rows">{children}</div></section> }
function SettingRow({ label, description, children }: { label: string; description: string; children: ReactNode }) { return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><div className="setting-control">{children}</div></div> }
function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) { return <button className={`toggle ${checked ? 'on' : ''}`} role="switch" aria-checked={checked} onClick={() => onChange(!checked)}><span /></button> }
function TaskModal({ value, setValue, recentTasks, onUseTemplate, onClose, onSave }: { value: string; setValue: (value: string) => void; recentTasks: string[]; onUseTemplate: (value: string) => void; onClose: () => void; onSave: () => void }) { return <div className="modal-backdrop"><div className="modal task-modal"><div className="modal-header"><div><p className="eyebrow">Your intention</p><h2>What will you focus on?</h2></div><button className="close-button" onClick={onClose}>×</button></div><label>Focused task<input autoFocus maxLength={80} value={value} placeholder="Study chapter 4" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSave() }} /></label><small className="modal-hint">Press Enter to save</small>{recentTasks.length > 0 && <div className="task-templates" aria-label="Recent tasks"><span>Recent</span>{recentTasks.map((item) => <button type="button" key={item} onClick={() => onUseTemplate(item)}>{item}</button>)}</div>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onSave}>Save task</button></div></div></div> }

export default App
