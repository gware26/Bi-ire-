import { useEffect, useRef, useState } from 'react'
import { FloppyDisk, MicrophoneSlash, Warning } from '@phosphor-icons/react'
import { api, type Segment } from '../lib/api'
import { ChunkRecorder } from '../lib/recorder'
import { useControls } from '../lib/hooks'
import { cues, looksLikeStop } from '../lib/voice'
import { announce } from '../lib/announce'
import { BigButton } from '../components/BigButton'

const CHUNK_SEC = 8
const SILENCE_PEAK = 0.001
const QUIET_WARN_SEC = 6

interface Props {
  course: string
  onFinished: (sessionId: number) => void
  onFailed: (message: string) => void
  onHome: () => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const BAR_SHAPE = [0.35, 0.6, 0.85, 1, 0.85, 0.6, 0.35]

function LevelWave({ level }: { level: number }) {
  const amp = Math.min(1, Math.sqrt(level) * 1.6)
  return (
    <span aria-hidden="true" className="flex h-10 items-center gap-1">
      {BAR_SHAPE.map((s, i) => (
        <span
          key={i}
          className="w-1.5 rounded-full bg-accent transition-[height] duration-100"
          style={{ height: `${Math.max(12, s * amp * 100)}%` }}
        />
      ))}
    </span>
  )
}

/** Hands-free personal notebook: speak, then save a structured note into Notebooks. */
export function SpeakNote({ course, onFinished, onFailed, onHome }: Props) {
  const [phase, setPhase] = useState<'starting' | 'recording' | 'finishing'>('starting')
  const [segments, setSegments] = useState<Segment[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [quiet, setQuiet] = useState(false)
  const [chunkError, setChunkError] = useState('')
  const [inFlight, setInFlight] = useState(0)

  const sessionId = useRef(0)
  const recorder = useRef<ChunkRecorder | null>(null)
  const pending = useRef(new Set<Promise<void>>())
  const seq = useRef(0)
  const segmentCount = useRef(0)
  const lastHeard = useRef(0)
  const started = useRef(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)
  const saveRef = useRef<() => Promise<void>>(async () => {})

  async function save() {
    if (phase !== 'recording' || !recorder.current) return
    setPhase('finishing')
    cues.stop()
    await recorder.current.stop()
    recorder.current = null
    await Promise.allSettled([...pending.current])
    if (segmentCount.current === 0) {
      cues.error()
      onFailed(
        chunkError
          ? `Nothing was saved: ${chunkError}`
          : 'No speech was heard. Speak for at least 15 seconds, then say â€œsave noteâ€.',
      )
      return
    }
    onFinished(sessionId.current)
  }

  saveRef.current = save

  useEffect(() => {
    if (started.current) return
    started.current = true
    let timer = 0
    ;(async () => {
      try {
        const { session_id } = await api.createSession(course)
        sessionId.current = session_id
        const rec = new ChunkRecorder(
          CHUNK_SEC,
          (wav, start, end) => {
            const n = seq.current++
            setInFlight((c) => c + 1)
            const p: Promise<void> = api
              .sendChunk(session_id, wav, n, start, end)
              .then(({ segment }) => {
                if (segment) {
                  segmentCount.current++
                  setSegments((s) => [...s, segment].sort((a, b) => a.start_sec - b.start_sec))
                  if (looksLikeStop(segment.text)) {
                    saveRef.current().catch(() => {})
                  }
                }
                setChunkError('')
              })
              .catch((e: Error) => setChunkError(e.message))
              .finally(() => {
                pending.current.delete(p)
                setInFlight((c) => c - 1)
              })
            pending.current.add(p)
          },
          SILENCE_PEAK,
        )
        await rec.start()
        recorder.current = rec
        setPhase('recording')
        cues.start()
        announce('Speak your note. Say over when you are done.')
        timer = window.setInterval(() => {
          const t = rec.elapsedSec()
          const l = rec.level()
          if (l > SILENCE_PEAK) lastHeard.current = t
          setElapsed(t)
          setLevel(l)
          setQuiet(t - lastHeard.current > QUIET_WARN_SEC)
        }, 100)
      } catch (e) {
        cues.error()
        onFailed(e instanceof Error ? e.message : 'Could not start the notebook')
      }
    })()
    return () => {
      window.clearInterval(timer)
      recorder.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [segments])

  useControls({ stop: save, home: onHome }, { Enter: save, Escape: save })

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-6 py-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <span
            aria-hidden="true"
            className={`size-5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-accent' : 'bg-muted-foreground'}`}
          />
          <span aria-live="polite">
            {phase === 'starting'
              ? 'Startingâ€¦'
              : phase === 'finishing'
                ? 'Saving your noteâ€¦'
                : course.trim()
                  ? `Speaking a note Â· ${course.trim()}`
                  : 'Speaking a note'}
          </span>
        </h1>
        <span className="flex items-center gap-4">
          {phase === 'recording' && <LevelWave level={level} />}
          <span className="font-mono text-3xl tabular-nums">
            <span className="sr-only">Elapsed time </span>
            {fmt(elapsed)}
          </span>
        </span>
      </header>

      {phase === 'recording' && quiet && (
        <p className="flex items-center gap-3 rounded-2xl bg-highlight px-6 py-4 text-xl font-bold text-on-highlight">
          <MicrophoneSlash aria-hidden="true" weight="bold" className="size-7 shrink-0" />
          <span>
            The microphone canâ€™t hear anything.
            {recorder.current?.deviceName() && ` Chrome is using â€œ${recorder.current.deviceName()}â€.`}
          </span>
        </p>
      )}

      <section
        aria-label="What you said"
        aria-live="polite"
        aria-relevant="additions"
        tabIndex={0}
        className="max-h-[50vh] flex-1 overflow-y-auto rounded-2xl border-2 border-border bg-card p-6 text-2xl leading-relaxed"
      >
        {segments.length === 0 && inFlight === 0 && (
          <p className="text-muted-foreground">Speak freelyâ€¦ your words appear here every {CHUNK_SEC} seconds.</p>
        )}
        {segments.map((s) => (
          <p key={s.id} lang={s.langs.length === 1 ? s.langs[0] : undefined} className="mb-4 max-w-[70ch]">
            {s.text}
          </p>
        ))}
        {inFlight > 0 && <p className="text-lg text-muted-foreground">Transcribingâ€¦</p>}
        {chunkError && (
          <p className="flex items-center gap-2 text-lg font-semibold text-destructive" role="alert">
            <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
            {chunkError}
          </p>
        )}
        <div ref={transcriptEnd} />
      </section>

      <BigButton
        tone="accent"
        icon={FloppyDisk}
        onClick={save}
        disabled={phase !== 'recording'}
        hint='Say "save note" or press Enter'
        className="min-h-[18vh]"
      >
        Save to notebooks
      </BigButton>
    </main>
  )
}
