import { useEffect, useRef, useState } from 'react'
import { BookmarkSimple, Stop, Warning } from '@phosphor-icons/react'
import { api, type Segment } from '../lib/api'
import { ChunkRecorder } from '../lib/recorder'
import { useControls } from '../lib/hooks'
import { cues } from '../lib/voice'
import { announce } from '../lib/announce'
import { BigButton } from '../components/BigButton'

const CHUNK_SEC = 10

interface Props {
  course: string
  onFinished: (sessionId: number) => void
  onFailed: (message: string) => void
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function Recording({ course, onFinished, onFailed }: Props) {
  const [phase, setPhase] = useState<'starting' | 'recording' | 'finishing'>('starting')
  const [segments, setSegments] = useState<Segment[]>([])
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [chunkError, setChunkError] = useState('')
  const [inFlight, setInFlight] = useState(0)

  const sessionId = useRef(0)
  const recorder = useRef<ChunkRecorder | null>(null)
  const pending = useRef(new Set<Promise<void>>())
  const seq = useRef(0)
  const started = useRef(false)
  const transcriptEnd = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let timer = 0
    ;(async () => {
      try {
        const { session_id } = await api.createSession(course)
        sessionId.current = session_id
        const rec = new ChunkRecorder(CHUNK_SEC, (wav, start, end) => {
          const n = seq.current++
          setInFlight((c) => c + 1)
          const p: Promise<void> = api
            .sendChunk(session_id, wav, n, start, end)
            .then(({ segment }) => {
              if (segment) setSegments((s) => [...s, segment].sort((a, b) => a.start_sec - b.start_sec))
              setChunkError('')
            })
            .catch((e: Error) => setChunkError(e.message))
            .finally(() => {
              pending.current.delete(p)
              setInFlight((c) => c - 1)
            })
          pending.current.add(p)
        })
        await rec.start()
        recorder.current = rec
        setPhase('recording')
        cues.start()
        announce('Recording started')
        timer = window.setInterval(() => setElapsed(rec.elapsedSec()), 500)
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

  useEffect(() => transcriptEnd.current?.scrollIntoView({ behavior: 'smooth' }), [segments])

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
    onFinished(sessionId.current)
  }

  useControls(
    { bookmark: () => bookmark('voice'), stop: finish },
    { Space: () => bookmark('key'), b: () => bookmark('key'), Enter: finish, Escape: finish },
  )

  return (
    <main id="main" tabIndex={-1} className="flex min-h-screen flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-6 py-4">
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <span
            aria-hidden="true"
            className={`size-5 shrink-0 rounded-full ${phase === 'recording' ? 'animate-pulse bg-destructive' : 'bg-muted-foreground'}`}
          />
          <span aria-live="polite">
            {phase === 'starting' ? 'Starting…' : phase === 'finishing' ? 'Saving last words…' : `Recording · ${course}`}
          </span>
        </h1>
        <span className="font-mono text-3xl tabular-nums">
          <span className="sr-only">Elapsed time </span>
          {fmt(elapsed)}
        </span>
      </header>

      <div className="grid flex-1 gap-4 md:grid-cols-[2fr_1fr]">
        <section
          aria-label="Live transcript"
          aria-live="polite"
          aria-relevant="additions"
          tabIndex={0}
          className="max-h-[60vh] overflow-y-auto rounded-2xl border-2 border-border bg-card p-6 text-2xl leading-relaxed md:max-h-none"
        >
          {segments.length === 0 && (
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
            hint='Say "end class" or press Enter'
            className="flex-1"
          >
            End class
          </BigButton>
        </div>
      </div>
    </main>
  )
}
