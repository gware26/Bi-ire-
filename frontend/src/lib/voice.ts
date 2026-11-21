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

// ---------- Voice commands ----------

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

/** Longer phrases first so short words do not steal them. */
const PHRASES: [Command, RegExp][] = [
  ['quiz', /\b(start (the )?quiz|quiz me|test me|give me (a |the )?quiz|quiz time)\b/],
  ['starttab', /\b((go to|open|show) (the )?start( tab| screen)?|start tab|start screen)\b/],
  ['speaknote', /\b(take|speak|dictate) (a |my )?note\b|\bnew note\b/],
  ['flip', /\b(flip( it| the card)?|show (me )?(the )?answer|turn (it )?over)\b/],
  ['read', /\bread (my |the )?notes\b/],
  ['done', /\b(i'?m done|that'?s my answer|next question)\b/],
  ['home', /\b(go home|main menu|home screen)\b/],
  ['next', /\bnext( card| one)?\b/],
  ['previous', /\b(previous|last card|go back)( card| one)?\b/],
  ['cards', /\b((open |show |go to )?(the )?flash ?cards?|flash ?cards?)\b/],
  ['ask', /\b((open |show |go to )?(the )?(ask|chat|tutor)|ask (a |the )?question|ask the tutor)\b/],
  ['plan', /\b((open |show |go to )?(my |the )?study plan)\b/],
  ['materials', /\b((open |show |go to )?(my |the )?(materials|files|slides))\b/],
  ['notes', /\b((open |show |go to )?(my |the )?notes)\b/],
  ['notebooks', /\b((open |show |go to )?(my |the )?notebooks?)\b/],
  ['settings', /\b((open |show |go to )?(the )?settings?|class setup)\b/],
  ['bookmark', /\b(bookmark|book mark|mark (this|that|it))\b/],
  ['stop', /\b(end|stop|finish) (the )?(class|lecture|recording|note)\b|\bsave (the |my )?note\b/],
  ['start', /\b(start|begin) (the )?(class|lecture|recording)\b/],
]

/**
 * Single-word (and short) aliases, including common Chrome mishearings.
 * Checked with exact match first, then 1-edit fuzzy for short words.
 */
const WORD_ALIASES: [Command, string[]][] = [
  ['stop', ['over', 'ova', 'ober', 'ovar', 'ofer', 'ouver', 'rover', 'hover', 'owen', 'oval', 'avo', 'finish', 'finished']],
  ['start', ['start', 'started', 'starts', 'begin', 'begun', 'stark', 'stat', 'starr']],
  ['quiz', ['quiz', 'quizzes', 'quis', 'quest', 'quests', 'quizzy']],
  ['bookmark', ['bookmark', 'bookmarks']],
  ['home', ['home']],
  ['next', ['next']],
  ['previous', ['previous', 'back']],
  ['cards', ['cards', 'card', 'flashcards', 'flashcard']],
  ['ask', ['ask', 'tutor', 'chat']],
  ['plan', ['plan']],
  ['materials', ['materials', 'files', 'slides']],
  ['notes', ['notes']],
  ['notebooks', ['notebooks', 'notebook']],
  ['settings', ['settings', 'setting']],
  ['flip', ['flip', 'flipped']],
  ['read', ['read']],
  ['done', ['done']],
]

const FILLER = new Set(['um', 'uh', 'erm', 'ah', 'oh', 'okay', 'ok', 'please', 'hey', 'yeah', 'yes', 'the', 'a', 'my'])

/** Strip punctuation Chrome adds so "start." and "Over!" still match. */
export function cleanHeard(raw: string) {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 0; i < a.length; i++) {
    let prev = i + 1
    for (let j = 0; j < b.length; j++) {
      const cur = a[i] === b[j] ? row[j]! : 1 + Math.min(row[j]!, row[j + 1]!, prev)
      row[j] = prev
      prev = cur
    }
    row[b.length] = prev
  }
  return row[b.length]!
}

/** True if word matches a target exactly or within 1 edit (for words 3+ letters). */
function closeTo(word: string, targets: string[]): boolean {
  for (const t of targets) {
    if (word === t) return true
    if (word.length >= 3 && t.length >= 3 && Math.abs(word.length - t.length) <= 1 && editDistance(word, t) <= 1) {
      return true
    }
  }
  return false
}

function contentWords(heard: string): string[] {
  return heard.split(' ').filter((w) => w && !FILLER.has(w))
}

/** True when the student said the short stop word (not lecture content like "over the years"). */
export function looksLikeStop(raw: string) {
  const heard = cleanHeard(raw)
  if (!heard) return false
  if (/\b(end|stop|finish) (the )?(class|lecture|recording|note)\b/.test(heard)) return true
  if (/\bsave (the |my )?note\b/.test(heard)) return true
  const words = contentWords(heard)
  if (words.length === 0 || words.length > 4) return false
  const last = words[words.length - 1]!
  return closeTo(last, WORD_ALIASES.find(([c]) => c === 'stop')![1])
}

export function looksLikeStart(raw: string) {
  const heard = cleanHeard(raw)
  if (!heard) return false
  if (/\b(start|begin) (the )?(class|lecture|recording)\b/.test(heard)) return true
  const words = contentWords(heard)
  if (words.length === 0 || words.length > 4) return false
  return closeTo(words[words.length - 1]!, WORD_ALIASES.find(([c]) => c === 'start')![1])
}

function matchShortCommand(heard: string): Command | null {
  const words = contentWords(heard)
  if (words.length === 0 || words.length > 4) return null
  const last = words[words.length - 1]!
  const prev = words.length > 1 ? words[words.length - 2]! : ''

  // "quiz me" / mishear + me
  if (last === 'me' && closeTo(prev, WORD_ALIASES.find(([c]) => c === 'quiz')![1])) return 'quiz'

  for (const [cmd, aliases] of WORD_ALIASES) {
    if (closeTo(last, aliases)) return cmd
    // whole short phrase is one alias token like "flashcards"
    if (words.length === 1 && closeTo(words[0]!, aliases)) return cmd
  }
  return null
}

export function matchCommand(raw: string): Command | null {
  const heard = cleanHeard(raw)
  if (!heard) return null
  const tail = heard.split(' ').slice(-5).join(' ')
  for (const [cmd, re] of PHRASES) {
    if (re.test(heard) || re.test(tail)) return cmd
  }
  return matchShortCommand(heard) ?? matchShortCommand(tail)
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
  private lastCmd: Command | null = null

  constructor(
    private onHeard: (cmd: Command | null, heard: string) => void,
    private onListening: (on: boolean) => void = () => {},
    private onError: (message: string) => void = () => {},
  ) {}

  get isRunning() {
    return this.running
  }

  /** Unlock mic (if needed) then start continuous recognition. Always tries to listen. */
  async enable() {
    const ok = await unlockMicrophone()
    if (!ok) {
      this.onError('Allow the microphone in the address bar so voice commands work.')
    } else {
      this.onError('')
    }
    this.start()
    return ok
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

    // en-US is most reliable for Chrome; still matches accented English via fuzzy aliases.
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
        // Score every alternative — quiet / accented speech often is not #1.
        for (let a = 0; a < alts; a++) {
          const t = e.results[i][a].transcript as string
          const hit = matchCommand(t)
          if (hit) {
            cmd = hit
            heard = t
            break
          }
          if (!heard) heard = t
        }
        const cleaned = cleanHeard(heard)
        if (!cleaned) continue

        if (cleaned !== this.lastShown) {
          this.lastShown = cleaned
          this.onHeard(cmd, cleaned)
        } else if (cmd) {
          this.onHeard(cmd, cleaned)
        }

        if (!cmd) continue
        // Allow interim short commands (over / start / quiz) so we do not wait for silence.
        const isFinal = e.results[i].isFinal as boolean
        const short = cleaned.split(' ').length <= 3
        if (!isFinal && !short) continue
        if (this.fired.has(i) && this.lastCmd === cmd) continue
        if (Date.now() - this.lastFire < 700 && this.lastCmd === cmd) continue

        this.fired.add(i)
        this.lastFire = Date.now()
        this.lastCmd = cmd
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
      if (err === 'network') {
        this.onError('Speech service offline. Check your internet.')
      }
      // audio-capture: recorder may own the mic briefly — onend will retry.
    }

    rec.onend = () => {
      if (gen !== this.generation) return
      this.fired.clear()
      if (!this.running) {
        this.onListening(false)
        return
      }
      setTimeout(() => {
        if (this.running && gen === this.generation) this.spawn()
      }, 200)
    }

    try {
      rec.start()
    } catch {
      setTimeout(() => {
        if (this.running && gen === this.generation) this.spawn()
      }, 350)
    }
  }
}
