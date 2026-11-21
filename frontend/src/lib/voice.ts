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

export type Command =
  | 'start'
  | 'stop'
  | 'bookmark'
  | 'quiz'
  | 'read'
  | 'done'
  | 'home'
  | 'flip'
  | 'next'
  | 'previous'
  | 'notes'
  | 'cards'
  | 'ask'
  | 'plan'
  | 'materials'
  | 'speaknote'
  | 'starttab'
  | 'notebooks'
  | 'settings'

const PATTERNS: [Command, RegExp][] = [
  ['quiz', /\b(start (the )?quiz|quiz me|test me)\b/],
  ['starttab', /\b((go to|open|show) (the )?start( tab| screen)?|start tab|start screen)\b/],
  ['speaknote', /\b(take|speak|dictate) (a |my )?note\b|\bnew note\b/],
  ['flip', /\b(flip( it| the card)?|show (me )?(the )?answer|turn (it )?over)\b/],
  ['read', /\bread (my |the )?notes\b/],
  ['done', /\b(i'?m done|that'?s my answer|next question)\b/],
  ['home', /\b(go home|main menu|home screen)\b/],
  ['next', /\bnext( card| one)?\b/],
  ['previous', /\b(previous|last card|go back)( card| one)?\b/],
  ['cards', /\b((open |show |go to )?(the )?flash ?cards?|(open |show |go to )?cards)\b/],
  ['ask', /\b((open |show |go to )?(the )?(ask|chat|tutor)|ask (a |the )?question|ask the tutor)\b/],
  ['plan', /\b((open |show |go to )?(my |the )?study plan|(open |show |go to )?plan)\b/],
  ['materials', /\b((open |show |go to )?(my |the )?(materials|files|slides)|materials|files|slides)\b/],
  ['notes', /\b((open |show |go to )?(my |the )?notes)\b/],
  ['notebooks', /\b((open |show |go to )?(my |the )?notebooks?|notebooks?)\b/],
  ['settings', /\b((open |show |go to )?(the )?settings?|class setup|settings?)\b/],
  ['bookmark', /\b(bookmark|mark (this|that))\b/],
]

/** Strip punctuation Chrome adds so "start." and "Over!" still match. */
export function cleanHeard(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** True when the student said the short stop word (not lecture content like "over the years"). */
export function looksLikeStop(raw: string) {
  const heard = cleanHeard(raw)
  if (!heard) return false
  if (/\b(end|stop|finish) (the )?(class|lecture|recording|note)\b/.test(heard)) return true
  if (/\bsave (the |my )?note\b/.test(heard)) return true
  const words = heard.split(' ')
  const last = words[words.length - 1]
  if (!['over', 'ova', 'ober', 'oliver'].includes(last)) return false
  return words.length <= 4
}

/** True when the student said the short start word (allows "um start", quiet mishears). */
export function looksLikeStart(raw: string) {
  const heard = cleanHeard(raw)
  if (!heard) return false
  if (/\b(start|begin) (the )?(class|lecture|recording)\b/.test(heard)) return true
  const words = heard.split(' ')
  const last = words[words.length - 1]
  if (!['start', 'begin', 'started', 'stark'].includes(last)) return false
  return words.length <= 4
}

function matchCommand(raw: string): Command | null {
  const heard = cleanHeard(raw)
  if (!heard) return null
  const tail = heard.split(' ').slice(-4).join(' ')
  for (const [cmd, re] of PATTERNS) {
    if (re.test(heard) || re.test(tail)) return cmd
  }
  if (looksLikeStart(heard)) return 'start'
  if (looksLikeStop(heard)) return 'stop'
  return null
}

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

/** Ask for mic access once — Chrome SpeechRecognition is unreliable until permission is granted. */
export async function unlockMicrophone(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach((t) => t.stop())
    return true
  } catch {
    return false
  }
}

export class CommandListener {
  private rec: any = null
  private running = false
  private generation = 0
  private fired = new Set<number>()
  private lastFire = 0
  private lastShown = ''

  constructor(
    private onHeard: (cmd: Command | null, heard: string) => void,
    private onListening: (on: boolean) => void = () => {},
    private onError: (message: string) => void = () => {},
  ) {}

  get isRunning() {
    return this.running
  }

  /** Unlock mic (if needed) then start continuous recognition. */
  async enable() {
    const ok = await unlockMicrophone()
    if (!ok) {
      this.onError('Microphone blocked. Allow the mic in the address bar, then try again.')
      this.onListening(false)
      return false
    }
    this.start()
    return true
  }

  start() {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) {
      this.onError('Voice commands need Chrome or Edge.')
      return
    }
    if (this.running) return
    this.running = true
    this.spawn()
  }

  stop() {
    this.running = false
    this.generation++
    const rec = this.rec
    this.rec = null
    try {
      rec?.abort()
    } catch {
      /* ignore */
    }
    this.onListening(false)
  }

  private spawn() {
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR || !this.running) return

    const gen = ++this.generation
    const rec = new SR()
    this.rec = rec
    this.fired.clear()

    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 5

    rec.onstart = () => {
      if (gen !== this.generation) return
      this.onListening(true)
      this.onError('')
    }

    rec.onaudiostart = () => {
      if (gen !== this.generation) return
      this.onListening(true)
    }

    rec.onresult = (e: any) => {
      if (gen !== this.generation) return
      for (let i = e.resultIndex; i < e.results.length; i++) {
        let cmd: Command | null = null
        let heard = ''
        const alts = e.results[i].length as number
        for (let a = 0; a < alts; a++) {
          heard = e.results[i][a].transcript
          cmd = matchCommand(heard)
          if (cmd) break
        }
        const cleaned = cleanHeard(heard)
        if (!cleaned) continue

        // Avoid re-render storms from identical interim text.
        if (cleaned !== this.lastShown) {
          this.lastShown = cleaned
          this.onHeard(cmd, cleaned)
        } else if (cmd) {
          this.onHeard(cmd, cleaned)
        }

        if (!cmd || this.fired.has(i) || Date.now() - this.lastFire < 900) continue
        this.fired.add(i)
        this.lastFire = Date.now()
        activeHandler?.(cmd)
      }
    }

    rec.onerror = (e: any) => {
      if (gen !== this.generation) return
      const err = String(e.error || '')
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        this.running = false
        this.onListening(false)
        this.onError('Microphone blocked. Allow the mic in the address bar.')
        return
      }
      // no-speech / aborted / network: let onend recreate the session
      if (err === 'network') {
        this.onError('Speech service offline. Check your internet, then tap the page once.')
      }
    }

    rec.onend = () => {
      if (gen !== this.generation) return
      this.fired.clear()
      if (!this.running) {
        this.onListening(false)
        return
      }
      // Always use a fresh instance — reusing a stopped SR often never hears again.
      setTimeout(() => {
        if (this.running && gen === this.generation) this.spawn()
      }, 280)
    }

    try {
      rec.start()
    } catch {
      setTimeout(() => {
        if (this.running && gen === this.generation) this.spawn()
      }, 400)
    }
  }
}
