import { useEffect, useRef, useState } from 'react'
import { BookmarkSimple, MicrophoneSlash, Stop, Warning } from '@phosphor-icons/react'
import { api, type Segment } from '../lib/api'
import { ChunkRecorder } from '../lib/recorder'
import { useControls } from '../lib/hooks'
import { cues, looksLikeStop } from '../lib/voice'
import { announce } from '../lib/announce'
import { BigButton } from '../components/BigButton'

// Each chunk is one Gemini request, and the free tier allows ~20 per model per day.
const CHUNK_SEC = 15
// Loudest sample below this = nobody spoke in the chunk, so it is not sent.
const SILENCE_PEAK = 0.003
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

export function Recording({ course, onFinished, onFailed, onHome }: Props) {
  const [phase, setPhase] = useState<'starting' | 'recording' | 'finishing'>('starting')
  const [segments, setSegments] = useState<Segment[]>([])
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [level, setLevel] = useState(0)
  const [quiet, setQuiet] = useState(false)
  const [silentChunk, setSilentChunk] = useState(false)
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
  const finishRef = useRef<() => Promise<void>>(async () => {})

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
            setSilentChunk(false)
            const n = seq.current++
            setInFlight((c) => c + 1)
            const p: Promise<void> = api
              .sendChunk(session_id, wav, n, start, end)
              .then(({ segment }) => {
                if (segment) {
                  segmentCount.current++
                  setSegments((s) => [...s, segment].sort((a, b) => a.start_sec - b.start_sec))
                  // Backup when Web Speech loses the mic to the recorder: "over" in the transcript ends class.
                  if (looksLikeStop(segment.text)) queue finishRef.current()
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
          () => setSilentChunk(true),
        )
        await rec.start()
        recorder.current = rec
        setPhase('recording')
        cues.start()
        announce('Recording started. Say over when you are done.')
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
        onFailed(e instanceof Error ? e.message : 'Could not start recording')
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

  useEffect(() => {
    if (quiet) announce('The microphone cannot hear anything')
  }, [quiet])

  function bookmark(trigger = 'tap') {
    if (phase !== 'recording' || !recorder.current) return
    const at = recorder.current.elapsedSec()
    cues.bookmark()
    announce(`Bookmark saved at ${fmt(at)}`)
    setBookmarks((b) => [...b, at])
    api.bookmark(sessionId.current, at, trigger).catch((e: Error) => setChunkError(e.message))
  }

  async function finish() {
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
          ? `No speech could be transcribed: ${chunkError}`
          : 'No speech was heard. Check that Chrome is using the right microphone and speak for at least 15 seconds.',
      )
      return
    }
    onFinished(sessionId.current)
  }

  finishRef.current = finish

  useControls(
    { bookmark: () => bookmark('voice'), stop: finish, home: onHome },
    { Space: () => bookmark('key'), b: () => bookmark('key'), Enter: finish, Escape: finish },
  )

  const nextIn = Math.max(1, Math.ceil(CHUNK_SEC - (elapsed % CHUNK_SEC)))

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-6 py-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <span
            aria-hidden="true"
            className={`size-5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-destructive' : 'bg-muted-foreground'}`}
          />
          <span aria-live="polite">
            {phase === 'starting' ? 'Starting…' : phase === 'finishing' ? 'Saving last words…' : course.trim() ? `Recording · ${course.trim()}` : 'Recording'}
          </span>
        </h1>
        <span className="flex items-center gap-4">
          {phase === 'recording' && (
            <>
              <LevelWave level={level} />
              <span aria-hidden="true" className="text-lg text-muted-foreground">
                next text in {nextIn}s
              </span>
            </>
          )}
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
            The microphone can’t hear anything.
            {recorder.current?.deviceName() && ` Chrome is using “${recorder.current.deviceName()}”.`} Pick another one with
            the microphone icon in the address bar, or check that it isn’t muted.
          </span>
        </p>
      )}

      <div className="grid flex-1 gap-4 md:grid-cols-[2fr_1fr]">
        <section
          aria-label="Live transcript"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          className="max-h-[60vh] overflow-y-auto rounded-2xl border-2 border-border bg-card p-6 text-2xl leading-relaxed md:max-h-none"
        >
          {segments.length === 0 && inFlight === 0 && (
            <p className="text-muted-foreground">Listening… the transcript appears every {CHUNK_SEC} seconds.</p>
          )}
          {segments.map((s) => (
            <p key={s.id} lang={s.langs.length === 1 ? s.langs[0] : undefined} className="mb-4 max-w-[70ch]">
              <span className="mr-2 rounded-md bg-muted px-2 py-0.5 align-middle text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {fmt(s.start_sec)} · {s.langs.join(' + ') || '—'}
              </span>
              {s.text}
            </p>
          ))}
          {inFlight > 0 && <p className="text-lg text-muted-foreground">Transcribing…</p>}
          {silentChunk && inFlight === 0 && (
            <p className="text-lg text-muted-foreground">No speech in the last {CHUNK_SEC} seconds.</p>
          )}
          {chunkError && (
            <p className="flex items-center gap-2 text-lg font-semibold text-destructive" role="alert">
              <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
              {chunkError}
            </p>
          )}
          <div ref={transcriptEnd} />
        </section>

        <div className="flex flex-col gap-4">
          <BigButton
            tone="highlight"
            icon={BookmarkSimple}
            onClick={() => bookmark()}
            disabled={phase !== 'recording'}
            hint={`Say "bookmark" or press Space · ${bookmarks.length} saved`}
            className="flex-[2]"
          >
            Bookmark
          </BigButton>
          <BigButton
            tone="destructive"
            icon={Stop}
            onClick={finish}
            disabled={phase !== 'recording'}
            hint='Say "over" or press Enter'
            className="flex-1"
          >
            Over
          </BigButton>
        </div>
      </div>
    </main>
  )
}
