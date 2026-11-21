import { useEffect, useState } from 'react'
import { ArrowClockwise, ArrowLeft, Ear, Microphone, MicrophoneSlash, PenNib, Warning } from '@phosphor-icons/react'
import { api, type Lang, type Note } from './lib/api'
import { SHORTCUTS_KEY, useStoredState } from './lib/hooks'
import { announce } from './lib/announce'
import { CommandListener, cues, speak, voiceCommandsSupported } from './lib/voice'
import { BigButton } from './components/BigButton'
import { Home } from './screens/Home'
import { Recording } from './screens/Recording'
import { SpeakNote } from './screens/SpeakNote'
import { Study } from './screens/Study'
import { Quiz } from './screens/Quiz'

type Screen =
  | { name: 'home' }
  | { name: 'recording'; key: number }
  | { name: 'speak'; key: number }
  | { name: 'processing'; sessionId: number; mode: 'lecture' | 'dictation' }
  | { name: 'notes' }
  | { name: 'quiz' }
  | { name: 'error'; message: string; retrySessionId?: number; retryMode?: 'lecture' | 'dictation' }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [lang, setLang] = useStoredState<Lang>('ln.lang', 'en')
  const [course, setCourse] = useStoredState('ln.course.v2', '')
  const [note, setNote] = useState<Note | null>(null)
  const [answerSec, setAnswerSec] = useStoredState('ln.answerSec', 15)
  const [shortcuts, setShortcuts] = useStoredState(SHORTCUTS_KEY, true)
  const [demoMode, setDemoMode] = useState<boolean | null>(null)
  const [heard, setHeard] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [voiceReady, setVoiceReady] = useState(false)

  useEffect(() => {
    const titles: Record<Screen['name'], string> = {
      home: 'Start a lecture',
      recording: 'Recording',
      speak: 'Speak a note',
      processing: 'Saving note',
      notes: note?.title ?? 'Notes',
      quiz: 'Quiz',
      error: 'Error',
    }
    document.title = `${titles[screen.name]} · Biʼire`
    if (screen.name !== 'home') document.getElementById('main')?.focus({ preventScroll: true })
  }, [screen, note])

  useEffect(() => {
    api.health().then((h) => setDemoMode(h.demo_mode)).catch(() => setDemoMode(null))
    const listener = new CommandListener(
      (cmd, text) => {
        setHeard(text)
        if (cmd) announce(`Heard: ${text}`)
      },
      setListening,
      setVoiceError,
    )
    ;(window as unknown as { __biireVoice?: CommandListener }).__biireVoice = listener

    // First click/key: unlock mic permission, then start recognition (Chrome needs both).
    const arm = () => {
      void listener.enable().then((ok) => {
        if (ok) setVoiceReady(true)
      })
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
    }
    window.addEventListener('pointerdown', arm)
    window.addEventListener('keydown', arm)

    return () => {
      window.removeEventListener('pointerdown', arm)
      window.removeEventListener('keydown', arm)
      delete (window as unknown as { __biireVoice?: CommandListener }).__biireVoice
      listener.stop()
    }
  }, [])

  useEffect(() => {
    const voice = (window as unknown as { __biireVoice?: CommandListener }).__biireVoice
    if (!voice) return
    // Recording owns the mic — pause commands; restore after if the user already enabled voice.
    if (screen.name === 'recording' || screen.name === 'speak') {
      voice.stop()
      setListening(false)
    } else if (voiceReady) {
      voice.start()
    }
  }, [screen, voiceReady])

  useEffect(() => {
    if (!heard) return
    const t = setTimeout(() => setHeard(''), 2500)
    return () => clearTimeout(t)
  }, [heard])

  async function enableVoice() {
    const voice = (window as unknown as { __biireVoice?: CommandListener }).__biireVoice
    if (!voice) return
    const ok = await voice.enable()
    if (ok) setVoiceReady(true)
  }

  const startClass = () => setScreen({ name: 'recording', key: Date.now() })
  const startSpeakNote = () => setScreen({ name: 'speak', key: Date.now() })

  async function buildNotes(sessionId: number, mode: 'lecture' | 'dictation' = 'lecture') {
    setScreen({ name: 'processing', sessionId, mode })
    try {
      const n = await api.endSession(sessionId, lang, mode)
      setNote(n)
      setScreen({ name: 'notes' })
      cues.correct()
      announce(`Saved to ${n.course_name}: ${n.title}`)
      speak(
        mode === 'dictation'
          ? `Your note is saved in ${n.course_name}: ${n.title}.`
          : `Your notes are ready: ${n.title}. Say "read notes", "quiz me", or "flashcards".`,
        'en',
      )
    } catch (e) {
      cues.error()
      setScreen({
        name: 'error',
        message: e instanceof Error ? e.message : 'Could not save notes',
        retrySessionId: sessionId,
        retryMode: mode,
      })
    }
  }

  async function openNote(id: number) {
    try {
      setNote(await api.getNote(id))
      setScreen({ name: 'notes' })
    } catch (e) {
      setScreen({ name: 'error', message: e instanceof Error ? e.message : 'Could not open notes' })
    }
  }

  const voiceOn = voiceCommandsSupported()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main"
        className="sr-only rounded-xl bg-primary px-6 py-3 text-xl font-bold text-on-primary focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-20"
      >
        Skip to main content
      </a>
      <header className="flex flex-wrap items-center justify-between gap-3 px-6 pt-4 text-lg">
        <span className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <PenNib aria-hidden="true" weight="bold" className="size-8 text-primary" />
          <span lang="am">ብዕሬ</span>
          <span className="text-primary">Biʼire</span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {demoMode && (
            <span className="rounded-md bg-highlight px-3 py-1 text-base font-bold text-on-highlight">Demo mode</span>
          )}
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 font-semibold text-muted-foreground">
              {voiceOn && listening ? (
                <Microphone aria-hidden="true" weight="bold" className="size-6 text-accent" />
              ) : (
                <MicrophoneSlash aria-hidden="true" weight="bold" className="size-6" />
              )}
              {!voiceOn
                ? 'Voice needs Chrome or Edge'
                : listening
                  ? 'Listening'
                  : 'Voice off'}
            </span>
            {voiceOn && !listening && screen.name !== 'recording' && screen.name !== 'speak' && (
              <button
                type="button"
                onClick={() => void enableVoice()}
                className="rounded-xl bg-accent px-4 py-2 text-base font-bold text-on-accent"
              >
                Enable voice
              </button>
            )}
          </span>
        </span>
      </header>

      {voiceError && (
        <p role="alert" className="mx-6 mt-3 rounded-xl bg-destructive/15 px-4 py-3 text-lg font-semibold text-destructive">
          {voiceError}
        </p>
      )}

      {heard && (
        <div
          aria-hidden="true"
          className="fixed bottom-24 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xl font-bold text-on-primary shadow-lg"
        >
          <Ear aria-hidden="true" weight="bold" className="size-6" />
          Heard: “{heard}”
        </div>
      )}

      {screen.name === 'home' && (
        <Home
          course={course}
          setCourse={setCourse}
          lang={lang}
          setLang={setLang}
          answerSec={answerSec}
          setAnswerSec={setAnswerSec}
          shortcuts={shortcuts}
          setShortcuts={setShortcuts}
          listening={listening}
          onStart={startClass}
          onSpeakNote={startSpeakNote}
          onOpenNote={openNote}
        />
      )}

      {screen.name === 'recording' && (
        <Recording
          key={screen.key}
          course={course}
          onFinished={(id) => buildNotes(id, 'lecture')}
          onFailed={(message) => setScreen({ name: 'error', message })}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}

      {screen.name === 'speak' && (
        <SpeakNote
          key={screen.key}
          course={course}
          onFinished={(id) => buildNotes(id, 'dictation')}
          onFailed={(message) => setScreen({ name: 'error', message })}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}

      {screen.name === 'processing' && (
        <main
          id="main"
          tabIndex={-1}
          aria-busy="true"
          className="flex min-h-[80vh] flex-col items-center justify-center gap-6 p-6 text-center"
        >
          <div aria-hidden="true" className="size-20 animate-spin rounded-full border-8 border-muted border-t-primary" />
          <h1 className="text-4xl font-bold">
            {screen.mode === 'dictation' ? 'Saving your note…' : 'Building your notes…'}
          </h1>
          <p className="text-2xl text-muted-foreground">
            {screen.mode === 'dictation'
              ? 'Cleaning up what you said and filing it in your notebooks'
              : 'Definitions, exam hints and takeaways'}
          </p>
        </main>
      )}

      {screen.name === 'notes' && note && (
        <Study
          key={note.id}
          note={note}
          answerSec={answerSec}
          onQuiz={() => setScreen({ name: 'quiz' })}
          onNewClass={startClass}
          onHome={() => setScreen({ name: 'home' })}
        />
      )}

      {screen.name === 'quiz' && note && (
        <Quiz note={note} answerSec={answerSec} onExit={() => setScreen({ name: 'notes' })} />
      )}

      {screen.name === 'error' && (
        <main id="main" tabIndex={-1} className="mx-auto flex min-h-[80vh] max-w-3xl flex-col justify-center gap-6 p-6">
          <h1 className="flex items-center gap-3 text-4xl font-bold text-destructive">
            <Warning aria-hidden="true" weight="bold" className="size-10 shrink-0" />
            Something went wrong
          </h1>
          <p role="alert" className="text-2xl">
            {screen.message}
          </p>
          {screen.retrySessionId !== undefined && (
            <BigButton
              icon={ArrowClockwise}
              onClick={() => buildNotes(screen.retrySessionId!, screen.retryMode ?? 'lecture')}
              hint="Your recording is saved"
            >
              Try again
            </BigButton>
          )}
          <BigButton tone="neutral" icon={ArrowLeft} onClick={() => setScreen({ name: 'home' })}>
            Home
          </BigButton>
        </main>
      )}
    </div>
  )
}
