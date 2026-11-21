import { useEffect, useState } from 'react'
import { ArrowClockwise, ArrowLeft, Ear, Microphone, MicrophoneSlash, Warning, Waveform } from '@phosphor-icons/react'
import { api, type Lang, type Note } from './lib/api'
import { SHORTCUTS_KEY, useStoredState } from './lib/hooks'
import { announce } from './lib/announce'
import { CommandListener, cues, speak, voiceCommandsSupported } from './lib/voice'
import { BigButton } from './components/BigButton'
import { Home } from './screens/Home'
import { Recording } from './screens/Recording'
import { Notes } from './screens/Notes'
import { Quiz } from './screens/Quiz'

type Screen =
  | { name: 'home' }
  | { name: 'recording'; key: number }
  | { name: 'processing'; sessionId: number }
  | { name: 'notes' }
  | { name: 'quiz' }
  | { name: 'error'; message: string; retrySessionId?: number }

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [lang, setLang] = useStoredState<Lang>('ln.lang', 'en')
  const [course, setCourse] = useStoredState('ln.course', 'Data Structures')
  const [note, setNote] = useState<Note | null>(null)
  const [answerSec, setAnswerSec] = useStoredState('ln.answerSec', 15)
  const [shortcuts, setShortcuts] = useStoredState(SHORTCUTS_KEY, true)
  const [demoMode, setDemoMode] = useState<boolean | null>(null)
  const [heard, setHeard] = useState('')

  useEffect(() => {
    const titles: Record<Screen['name'], string> = {
      home: 'Start a lecture',
      recording: 'Recording',
      processing: 'Building notes',
      notes: note?.title ?? 'Notes',
      quiz: 'Quiz',
      error: 'Error',
    }
    document.title = `${titles[screen.name]} · LissanNote`
    if (screen.name !== 'home') document.getElementById('main')?.focus({ preventScroll: true })
  }, [screen, note])

  useEffect(() => {
    api.health().then((h) => setDemoMode(h.demo_mode)).catch(() => setDemoMode(null))
    const listener = new CommandListener((_, text) => {
      setHeard(text)
      announce(`Heard: ${text}`)
    })
    listener.start()
    return () => listener.stop()
  }, [])

  useEffect(() => {
    if (!heard) return
    const t = setTimeout(() => setHeard(''), 2500)
    return () => clearTimeout(t)
  }, [heard])

  const startClass = () => setScreen({ name: 'recording', key: Date.now() })

  async function buildNotes(sessionId: number) {
    setScreen({ name: 'processing', sessionId })
    try {
      const n = await api.endSession(sessionId, lang)
      setNote(n)
      setScreen({ name: 'notes' })
      cues.correct()
      announce(`Your notes are ready: ${n.title}`)
      speak(`Your notes are ready: ${n.title}. Say "read notes" or "quiz me".`, 'en')
    } catch (e) {
      cues.error()
      setScreen({ name: 'error', message: e instanceof Error ? e.message : 'Could not build notes', retrySessionId: sessionId })
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
          <Waveform aria-hidden="true" weight="bold" className="size-8 text-primary" />
          <span>
            Lissan<span className="text-primary">Note</span>
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {demoMode && (
            <span className="rounded-md bg-highlight px-3 py-1 text-base font-bold text-on-highlight">Demo mode</span>
          )}
          <span className="flex items-center gap-2 font-semibold text-muted-foreground">
            {voiceOn ? (
              <Microphone aria-hidden="true" weight="bold" className="size-6 text-accent" />
            ) : (
              <MicrophoneSlash aria-hidden="true" weight="bold" className="size-6" />
            )}
            {voiceOn ? 'Voice control on' : 'Voice control needs Chrome or Edge'}
          </span>
        </span>
      </header>

      {heard && (
        <div
          aria-hidden="true"
          className="fixed bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xl font-bold text-on-primary shadow-lg"
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
          onStart={startClass}
          onOpenNote={openNote}
        />
      )}

      {screen.name === 'recording' && (
        <Recording
          key={screen.key}
          course={course}
          onFinished={buildNotes}
          onFailed={(message) => setScreen({ name: 'error', message })}
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
          <h1 className="text-4xl font-bold">Building your notes…</h1>
          <p className="text-2xl text-muted-foreground">Definitions, exam hints and takeaways</p>
        </main>
      )}

      {screen.name === 'notes' && note && (
        <Notes note={note} onQuiz={() => setScreen({ name: 'quiz' })} onNewClass={startClass} onHome={() => setScreen({ name: 'home' })} />
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
              onClick={() => buildNotes(screen.retrySessionId!)}
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
