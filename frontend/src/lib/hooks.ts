import { useEffect, useState } from 'react'
import { setCommandHandler, type Command } from './voice'

type Actions = Partial<Record<Command, () => void>>
type Keys = Record<string, () => void>

export const SHORTCUTS_KEY = 'ln.shortcuts'

/** WCAG 2.1.4: single-key shortcuts must be switchable off (speech-input users trigger them by accident). */
export function shortcutsEnabled() {
  return localStorage.getItem(SHORTCUTS_KEY) !== 'false'
}

/** Space/Enter on a focused control must activate that control, not a screen-wide shortcut. */
function isInteractive(el: EventTarget | null) {
  return el instanceof HTMLElement && el.closest('button, a, input, select, textarea, [role="button"]') !== null
}

/** Binds voice commands and keyboard keys for the visible screen. Re-binds every render so handlers stay fresh. */
export function useControls(commands: Actions, keys: Keys = {}) {
  useEffect(() => {
    setCommandHandler((c) => commands[c]?.())
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || !shortcutsEnabled()) return
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const key = e.key === ' ' ? 'Space' : e.key
      if ((key === 'Space' || key === 'Enter') && isInteractive(e.target)) return
      const fn = keys[key]
      if (fn) {
        e.preventDefault()
        fn()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      setCommandHandler(null)
      window.removeEventListener('keydown', onKey)
    }
  })
}

export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    return raw === null ? initial : (JSON.parse(raw) as T)
  })
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value))
  }, [key, value])
  return [value, setValue] as const
}
