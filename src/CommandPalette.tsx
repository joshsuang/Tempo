import { useEffect, useRef, useState } from 'react'
type Mode = 'pomodoro' | 'stopwatch' | 'until' | 'countdown'

type CommandPaletteProps = {
  open: boolean
  onClose: () => void
  mode: Mode
  running: boolean
  onStartPause: () => void
  onReset: () => void
  onMode: (mode: Mode) => void
  onSettings: () => void
  onAppearance: () => void
  onAdjustTime: (minutes: number) => void
  onEditTask: () => void
  onClearTask: () => void
}
type Command = { icon: string; label: string; action: () => void }

export default function CommandPalette({ open, onClose, mode, running, onStartPause, onReset, onMode, onSettings, onAppearance, onAdjustTime, onEditTask, onClearTask }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const commands: Command[] = [
    { icon: running ? 'Ⅱ' : '▶', label: running ? 'Pause timer' : 'Start timer', action: onStartPause },
    { icon: '↻', label: 'Reset timer', action: onReset },
    { icon: '+', label: 'Add 5 minutes', action: () => onAdjustTime(5) },
    { icon: '−', label: 'Remove 5 minutes', action: () => onAdjustTime(-5) },
    { icon: '✎', label: 'Edit focused task', action: onEditTask },
    { icon: '×', label: 'Clear focused task', action: onClearTask },
    { icon: '◷', label: 'Switch to Pomodoro', action: () => onMode('pomodoro') },
    { icon: '↗', label: 'Switch to Stopwatch', action: () => onMode('stopwatch') },
    { icon: '◌', label: 'Switch to Until', action: () => onMode('until') },
    { icon: '⌛', label: 'Switch to Countdown', action: () => onMode('countdown') },
    { icon: '⚙', label: 'Open Settings', action: onSettings },
    { icon: '◐', label: 'Toggle appearance', action: onAppearance },
  ]
  const filtered = commands.filter((command) => command.label.toLowerCase().includes(query.trim().toLowerCase()))

  useEffect(() => {
    if (!open) return
    setQuery(''); setSelected(0)
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose() }
      if (!filtered.length) return
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelected((value) => (value + 1) % filtered.length) }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelected((value) => (value - 1 + filtered.length) % filtered.length) }
      if (event.key === 'Enter') { event.preventDefault(); filtered[selected]?.action(); onClose() }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, filtered, selected, onClose])

  if (!open) return null
  return <div className="tempo-command-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><div className="tempo-command-panel" role="dialog" aria-modal="true" aria-label="Tempo command palette"><input ref={inputRef} value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0) }} placeholder="What would you like to do?" aria-label="Search commands" /><div className="tempo-command-list">{filtered.length ? filtered.map((command, index) => <button className={index === selected ? 'selected' : ''} key={command.label} onMouseEnter={() => setSelected(index)} onClick={() => { command.action(); onClose() }}><span>{command.icon}</span>{command.label}{command.label.includes(mode[0].toUpperCase() + mode.slice(1)) && <small>current</small>}</button>) : <div className="tempo-command-empty">No commands found</div>}</div><div className="tempo-command-hint"><kbd>↑</kbd><kbd>↓</kbd> navigate <kbd>↵</kbd> select <kbd>esc</kbd> close</div></div></div>
}
