import type { Lang } from './api'

// ---------- Text-to-speech ----------

const BCP47: Record<Lang, string> = { en: 'en-US', am: 'am-ET', om: 'om-ET' }
let voices: SpeechSynthesisVoice[] = []
let speechToken = 0

if ('speechSynthesis' in window) {
  const load = () => (voices = speechSynthesis.getVoices())
  load()
  speechSynthesis.onvoiceschanged = load
}

export function hasVoice(lang: Lang) {
  return voices.some((v) => v.lang.toLowerCase().startsWith(lang))
}

/** Speaks sentence by sentence (Chrome cuts off long utterances). Resolves when done or cancelled. */
export function speak(text: string, lang: Lang = 'en'): Promise<void> {
  stopSpeaking()
  const token = speechToken
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text.trim()) return resolve()
    const voice = voices.find((v) => v.lang.toLowerCase().startsWith(lang))
    const parts = text.match(/[^.!?።\n]+[.!?።]?/g) ?? [text]
    let i = 0
    const next = () => {
      if (token !== speechToken || i >= parts.length) return resolve()
      const u = new SpeechSynthesisUtterance(parts[i++].trim())
      u.lang = voice?.lang ?? BCP47[lang]
      if (voice) u.voice = voice
      u.rate = 0.95
      u.onend = next
      u.onerror = next
      speechSynthesis.speak(u)
    }
    next()
  })
}

export function stopSpeaking() {
  speechToken++
  if ('speechSynthesis' in window) speechSynthesis.cancel()
}

// ---------- Audio cues (so the student never has to look at the screen) ----------

let cueCtx: AudioContext | null = null

function beep(freq: number, ms: number, delay = 0) {
  cueCtx ??= new AudioContext()
  const t = cueCtx.currentTime + delay / 1000
  const osc = cueCtx.createOscillator()
  const gain = cueCtx.createGain()
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.18, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000)
  osc.connect(gain).connect(cueCtx.destination)
  osc.start(t)
  osc.stop(t + ms / 1000)
}

export const cues = {
  start: () => (beep(660, 120), beep(880, 180, 140)),
  stop: () => (beep(880, 120), beep(660, 180, 140)),
  bookmark: () => beep(1175, 140),
  listen: () => beep(740, 220),
  correct: () => (beep(784, 120), beep(1047, 200, 130)),
  wrong: () => beep(330, 300),
  error: () => beep(220, 400),
}

// ---------- Voice commands (English wake phrases via the Web Speech API) ----------

export type Command = 'start' | 'stop' | 'bookmark' | 'quiz' | 'read' | 'done' | 'home'

const PATTERNS: [Command, RegExp][] = [
  ['start', /\b(start|begin) (the )?(class|lecture|recording)\b/],
  ['stop', /\b(end|stop|finish) (the )?(class|lecture|recording)\b/],
  ['bookmark', /\b(bookmark|mark (this|that))\b/],
  ['quiz', /\b(start (the )?quiz|quiz me|test me)\b/],
  ['read', /\bread (my |the )?notes\b/],
  ['done', /\b(i'?m done|that'?s my answer|next question)\b/],
  ['home', /\b(go home|main menu)\b/],
]

type Handler = (c: Command) => void
let activeHandler: Handler | null = null

/** The currently visible screen registers what each command does. */
export function setCommandHandler(h: Handler | null) {
  activeHandler = h
}

export function voiceCommandsSupported() {
  const w = window as unknown as Record<string, unknown>
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition)
}

export class CommandListener {
  private rec: any = null
  private running = false
  private fired = new Set<number>()
  private lastFire = 0

  constructor(
    private onHeard: (cmd: Command, heard: string) => void,
    private onListening: (on: boolean) => void = () => {},
  ) {}

  start() {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR || this.running) return
    this.running = true
    const rec = new SR()
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (this.fired.has(i)) continue
        const heard: string = e.results[i][0].transcript.toLowerCase()
        const hit = PATTERNS.find(([, re]) => re.test(heard))
        if (!hit || Date.now() - this.lastFire < 1500) continue
        this.fired.add(i)
        this.lastFire = Date.now()
        this.onHeard(hit[0], heard.trim())
        activeHandler?.(hit[0])
      }
    }
    rec.onaudiostart = () => this.onListening(true)
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') this.running = false
    }
    rec.onend = () => {
      this.fired.clear()
      // Chrome ends recognition every so often; we restart right away, so only report a real stop.
      if (this.running) setTimeout(() => this.running && safeStart(rec), 250)
      else this.onListening(false)
    }
    safeStart(rec)
    this.rec = rec
  }

  stop() {
    this.running = false
    this.rec?.abort()
    this.rec = null
    this.onListening(false)
  }
}

function safeStart(rec: any) {
  try {
    rec.start()
  } catch {
    // already started
  }
}
