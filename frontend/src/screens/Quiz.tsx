import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle,
  Microphone,
  SpeakerHigh,
  Stop,
  Trophy,
  Warning,
  XCircle,
  type Icon,
} from '@phosphor-icons/react'
import { api, type Lang, type Note, type QuizQuestion, type QuizResult } from '../lib/api'
import { recordOnce } from '../lib/recorder'
import { useControls } from '../lib/hooks'
import { cues, speak, stopSpeaking } from '../lib/voice'
import { BigButton } from '../components/BigButton'

type Phase = 'loading' | 'asking' | 'listening' | 'checking' | 'feedback' | 'done' | 'error'

interface Props {
  note: Note
  /** WCAG 2.2.1: the student chooses the answer window on the Home screen. */
  answerSec: number
  onExit: () => void
}

export function Quiz({ note, answerSec, onExit }: Props) {
  const [quizLang, setQuizLang] = useState<Lang>(note.out_lang)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [index, setIndex] = useState(0)
  const [phase, setPhase] = useState<Phase>('loading')
  const [result, setResult] = useState<QuizResult | null>(null)
  const [score, setScore] = useState(0)
  const [error, setError] = useState('')

  const alive = useRef(true)
  const finishAnswer = useRef<() => void>(() => {})
  const started = useRef(false)

  useEffect(() => {
    alive.current = true
    if (!started.current) {
      started.current = true
      run()
    }
    return () => {
      alive.current = false
      stopSpeaking()
      finishAnswer.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function run() {
    try {
      const quiz = await api.createQuiz(note.id)
      if (!alive.current) return
      setQuestions(quiz.questions)
      setQuizLang(quiz.out_lang)
      let correct = 0
      for (let i = 0; i < quiz.questions.length; i++) {
        if (!alive.current) return
        const ok = await ask(quiz.questions[i], i, quiz.out_lang)
        if (ok) correct++
        setScore(correct)
      }
      if (!alive.current) return
      setPhase('done')
      await speak(`Quiz finished. You got ${correct} out of ${quiz.questions.length}.`, 'en')
    } catch (e) {
      if (!alive.current) return
      cues.error()
      setError(e instanceof Error ? e.message : 'Quiz failed')
      setPhase('error')
    }
  }

  async function ask(q: QuizQuestion, i: number, lang: Lang): Promise<boolean> {
    setIndex(i)
    setResult(null)
    setPhase('asking')
    await speak(`Question ${i + 1}. ${q.question}`, lang)
    if (!alive.current) return false

    setPhase('listening')
    cues.listen()
    const stopSignal = new Promise<void>((resolve) => (finishAnswer.current = resolve))
    const wav = await recordOnce(answerSec, stopSignal)
    if (!alive.current || !wav) return false

    setPhase('checking')
    const r = await api.answer(q.id, wav)
    if (!alive.current) return false
    setResult(r)
    setPhase('feedback')
    if (r.correct) cues.correct()
    else cues.wrong()
    await speak(r.feedback, lang)
    return r.correct
  }

  useControls({ done: () => finishAnswer.current(), home: onExit }, { Space: () => finishAnswer.current(), Escape: onExit })

  const q = questions[index]
  const status: Record<Phase, string> = {
    loading: 'Preparing your quiz…',
    asking: 'Listen to the question',
    listening: `Answer now (up to ${answerSec} seconds)`,
    checking: 'Checking your answer…',
    feedback: result?.correct ? 'Correct!' : 'Not quite',
    done: `Finished: ${score} / ${questions.length}`,
    error: 'Something went wrong',
  }

  const StatusIcon: Icon =
    phase === 'listening'
      ? Microphone
      : phase === 'feedback'
        ? result?.correct
          ? CheckCircle
          : XCircle
        : phase === 'done'
          ? Trophy
          : phase === 'error'
            ? Warning
            : SpeakerHigh
  const statusTone =
    phase === 'listening' || phase === 'error' || (phase === 'feedback' && !result?.correct)
      ? 'bg-destructive text-on-destructive'
      : phase === 'feedback' || phase === 'done'
        ? 'bg-accent text-on-accent'
        : 'bg-muted text-foreground'

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-screen max-w-4xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold">
          <span lang={quizLang}>{note.title}</span> · Quiz
        </h1>
        {questions.length > 0 && (
          <span className="text-2xl font-bold tabular-nums" aria-label={`Question ${Math.min(index + 1, questions.length)} of ${questions.length}`}>
            {Math.min(index + 1, questions.length)} / {questions.length}
          </span>
        )}
      </header>

      <section
        className="flex flex-1 flex-col justify-center gap-6 rounded-2xl border-2 border-border bg-card p-8"
        aria-live="polite"
      >
        <p
          className={`flex items-center gap-3 self-start rounded-xl px-4 py-2 text-2xl font-bold ${statusTone} ${
            phase === 'listening' ? 'animate-pulse' : ''
          }`}
        >
          <StatusIcon aria-hidden="true" weight="bold" className="size-7 shrink-0" />
          {status[phase]}
        </p>
        {q && phase !== 'done' && (
          <p lang={quizLang} className="max-w-[40ch] font-display text-4xl font-bold leading-snug">
            {q.question}
          </p>
        )}
        {result && (
          <div className="flex max-w-[60ch] flex-col gap-2 text-2xl">
            <p className="text-muted-foreground">You said: “{result.heard}”</p>
            <p lang={quizLang}>{result.feedback}</p>
          </div>
        )}
        {error && (
          <p className="text-xl font-semibold text-destructive" role="alert">
            {error}
          </p>
        )}
      </section>

      {phase === 'listening' ? (
        <BigButton
          tone="destructive"
          icon={Stop}
          onClick={() => finishAnswer.current()}
          hint="Say “I'm done” or press Space"
          className="min-h-[25vh]"
        >
          Done answering
        </BigButton>
      ) : (
        <BigButton tone="neutral" icon={ArrowLeft} onClick={onExit} hint="Press Escape or say “go home”" className="min-h-[15vh]">
          Back to notes
        </BigButton>
      )}
    </main>
  )
}
