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
  // Longer / more specific phrases first.
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
  ['notes', /\b((open |show |go to )?(my |the )?notes|notes)\b/],
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
  // Quiet ASR often mishears "over" as these.
  if (!['over', 'ova', 'ober', 'oliver', 'other'].includes(last)) return false
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
    this.bind(new SR())
  }

  /** Call after getUserMedia starts — Chrome often kills recognition when the recorder opens the mic. */
  restart() {
    if (!this.running) return
    try {
      this.rec?.abort()
    } catch {
      /* already stopped */
    }
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return
    this.fired.clear()
    this.bind(new SR())
  }

  private bind(rec: any) {
    rec.lang = 'en-US'
    rec.continuous = true
    rec.interimResults = false
    rec.maxAlternatives = 5
    rec.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal || this.fired.has(i)) continue
        let cmd: Command | null = null
        let heard = ''
        const alts = e.results[i].length as number
        for (let a = 0; a < alts; a++) {
          heard = e.results[i][a].transcript
          cmd = matchCommand(heard)
          if (cmd) break
        }
        if (!cmd || Date.now() - this.lastFire < 900) continue
        this.fired.add(i)
        this.lastFire = Date.now()
        this.onHeard(cmd, cleanHeard(heard))
        activeHandler?.(cmd)
      }
    }
    rec.onaudiostart = () => this.onListening(true)
    rec.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.running = false
        this.onListening(false)
      }
      // audio-capture / aborted: mic stolen by recorder — onend will restart.
    }
    rec.onend = () => {
      this.fired.clear()
      if (this.running) setTimeout(() => this.running && safeStart(rec), 300)
      else this.onListening(false)
    }
    safeStart(rec)
    this.rec = rec
  }

  stop() {
    this.running = false
    try {
      this.rec?.abort()
    } catch {
      /* ignore */
    }
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
