import { useEffect, useRef, useState } from 'react'
import { ChatCircleText, FileText, Microphone, PaperPlaneRight, SpeakerHigh, Stop, Warning } from '@phosphor-icons/react'
import { api, type ChatMessage, type Note } from '../../lib/api'
import { recordOnce } from '../../lib/recorder'
import { useControls, type Actions } from '../../lib/hooks'
import { announce } from '../../lib/announce'
import { cues, speak, stopSpeaking } from '../../lib/voice'
import { BigButton } from '../../components/BigButton'
import { Sources } from '../Notes'

const SUGGESTIONS = ['Explain the main idea simply', 'What will be on the exam?', 'Give me a real-life example', 'Quiz me with one question']
const MAX_QUESTION_SEC = 30

interface Props {
  note: Note
  answerSec: number
  onOpenSource: (id: number) => void
  extraCommands: Actions
  onHome: () => void
}

type Phase = 'idle' | 'listening' | 'thinking'

export function Ask({ note, onOpenSource, extraCommands, onHome }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [phase, setPhase] = useState<Phase>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const stopRecording = useRef<() => void>(() => {})
  const alive = useRef(true)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    alive.current = true
    api.chatHistory(note.id).then((m) => alive.current && setMessages(m)).catch(() => {})
    return () => {
      alive.current = false
      stopRecording.current()
      stopSpeaking()
    }
  }, [note.id])

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [messages, phase])

  async function send(question: string | Blob) {
    if (phase !== 'idle' && typeof question === 'string') return
    stopSpeaking()
    setError('')
    setPhase('thinking')
    try {
      const pair = await api.ask(note.id, question)
      if (!alive.current) return
      setMessages((m) => [...m, ...pair])
      setText('')
      setPhase('idle')
      const answer = pair[pair.length - 1]
      announce(`Tutor: ${answer.text}`)
      speak(answer.text, note.out_lang)
    } catch (e) {
      if (!alive.current) return
      cues.error()
      setError(e instanceof Error ? e.message : 'The tutor could not answer')
      setPhase('idle')
    }
  }

  async function askByVoice() {
    if (phase !== 'idle') return
    stopSpeaking()
    setError('')
    setPhase('listening')
    cues.listen()
    announce('Listening. Ask your question, then say “I’m done”.')
    const stop = new Promise<void>((resolve) => (stopRecording.current = resolve))
    const wav = await recordOnce(MAX_QUESTION_SEC, stop)
    stopRecording.current = () => {}
    if (!alive.current) return
    if (!wav) {
      setPhase('idle')
      return
    }
    await send(wav)
  }

  function finishOrAsk() {
    if (phase === 'listening') stopRecording.current()
    else askByVoice()
  }

  useControls(
    { ...extraCommands, ask: askByVoice, done: () => stopRecording.current(), home: onHome },
    { Space: finishOrAsk },
  )

  const last = [...messages].reverse().find((m) => m.role === 'assistant')

  return (
    <>
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <ChatCircleText aria-hidden="true" weight="bold" className="size-8 shrink-0" />
        Ask the tutor
      </h1>
      <p className="text-xl text-muted-foreground">
        Answers come from this lecture and your uploaded materials, and are read aloud.
      </p>

      <section aria-label="Conversation" className="flex flex-col gap-3">
        {messages.length === 0 && phase === 'idle' && (
          <p className="rounded-2xl border-2 border-dashed border-border p-6 text-xl text-muted-foreground">
            No questions yet. Tap a suggestion, ask by voice, or type below.
          </p>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className="max-w-[60ch] self-end rounded-2xl rounded-br-md bg-primary px-5 py-3 text-xl text-on-primary">
              <span className="sr-only">You asked: </span>
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="max-w-[65ch] self-start rounded-2xl rounded-bl-md border-2 border-border bg-card px-5 py-4">
              <p lang={note.out_lang} className="text-xl leading-relaxed">
                <span className="sr-only">Tutor: </span>
                {m.text}
              </p>
              {(m.sources.source_ids?.length || m.sources.materials?.length) ? (
                <p className="mt-2 flex flex-wrap items-center gap-2 text-base text-muted-foreground">
                  Sources
                  <Sources ids={m.sources.source_ids ?? []} onOpen={onOpenSource} />
                  {m.sources.materials?.map((f) => (
                    <span key={f} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-sm font-bold">
                      <FileText aria-hidden="true" weight="bold" className="size-4" />
                      {f}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>
          ),
        )}
        {phase === 'thinking' && (
          <p role="status" className="flex items-center gap-3 self-start text-xl text-muted-foreground">
            <span aria-hidden="true" className="size-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
            Thinking…
          </p>
        )}
        {error && (
          <p role="alert" className="flex items-center gap-2 text-lg font-semibold text-destructive">
            <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
            {error}
          </p>
        )}
        <div ref={end} />
      </section>

      <div className="flex flex-wrap gap-2" aria-label="Suggested questions" role="group">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={phase !== 'idle'}
            onClick={() => send(s)}
            className="min-h-12 rounded-full border-2 border-border px-4 text-lg font-semibold transition-colors duration-200 hover:bg-muted disabled:opacity-50"
          >
            {s}
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        {phase === 'listening' ? (
          <BigButton tone="destructive" icon={Stop} onClick={() => stopRecording.current()} hint='Say “I’m done” or press Space'>
            Done asking
          </BigButton>
        ) : (
          <BigButton
            tone="accent"
            icon={Microphone}
            onClick={askByVoice}
            disabled={phase !== 'idle'}
            hint='Say “ask a question” or press Space'
          >
            Ask by voice
          </BigButton>
        )}
        {last && (
          <BigButton tone="neutral" icon={SpeakerHigh} onClick={() => speak(last.text, note.out_lang)} hint="Hear the last answer">
            Repeat
          </BigButton>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (text.trim()) send(text.trim())
        }}
      >
        <label htmlFor="ask-text" className="sr-only">
          Type a question
        </label>
        <input
          id="ask-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or type a question…"
          autoComplete="off"
          className="min-h-14 min-w-0 flex-1 rounded-xl border-2 border-border bg-background px-4 text-xl text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!text.trim() || phase !== 'idle'}
          className="flex min-h-14 min-w-14 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-xl font-bold text-on-primary disabled:opacity-50"
        >
          <PaperPlaneRight aria-hidden="true" weight="bold" className="size-6" />
          <span className="max-sm:sr-only">Send</span>
        </button>
      </form>
    </>
  )
}
