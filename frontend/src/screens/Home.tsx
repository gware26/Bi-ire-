import { useEffect, useState } from 'react'
import { BookOpenText, CaretRight, Check, GearSix, Microphone, type Icon } from '@phosphor-icons/react'
import { api, type Lang, type NoteSummary } from '../lib/api'
import { useControls } from '../lib/hooks'

const LANG_LABELS: [Lang, string][] = [
  ['en', 'English'],
  ['am', 'አማርኛ'],
  ['om', 'Afaan Oromoo'],
]

export const ANSWER_TIMES = [8, 15, 30]

type Tab = 'start' | 'notebooks' | 'settings'

const TABS: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'start', label: 'Start', icon: Microphone },
  { id: 'notebooks', label: 'Notebooks', icon: BookOpenText },
  { id: 'settings', label: 'Settings', icon: GearSix },
]

interface Props {
  course: string
  setCourse: (c: string) => void
  lang: Lang
  setLang: (l: Lang) => void
  answerSec: number
  setAnswerSec: (s: number) => void
  shortcuts: boolean
  setShortcuts: (on: boolean) => void
  listening: boolean
  onStart: () => void
  onOpenNote: (id: number) => void
}

function Toggle({ pressed, onClick, children, lang }: { pressed: boolean; onClick: () => void; children: string; lang?: string }) {
  return (
    <button
      type="button"
      lang={lang}
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 text-xl font-bold transition-colors duration-200 ${
        pressed ? 'border-primary bg-primary text-on-primary' : 'border-border bg-background text-foreground hover:bg-muted'
      }`}
    >
      {pressed && <Check aria-hidden="true" weight="bold" className="size-5 shrink-0" />}
      {children}
    </button>
  )
}

const WAVE_HEIGHTS = [0.45, 0.8, 1, 0.65, 0.9, 0.55, 0.75]

/** Animated sound bars while the voice listener is live; nothing at all when it is not. */
function Wave({ on }: { on: boolean }) {
  return (
    <span aria-hidden="true" className="flex h-12 items-center gap-1.5">
      {on &&
        WAVE_HEIGHTS.map((h, i) => (
          <span
            key={i}
            className="ln-wave-bar w-2 rounded-full bg-current"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 0.12}s` }}
          />
        ))}
    </span>
  )
}

export function Home(props: Props) {
  const { course, setCourse, lang, setLang, answerSec, setAnswerSec, shortcuts, setShortcuts, listening, onStart, onOpenNote } = props
  const [tab, setTab] = useState<Tab>('start')
  const [notes, setNotes] = useState<NoteSummary[]>([])

  useEffect(() => {
    api.listNotes().then(setNotes).catch(() => setNotes([]))
  }, [])

  useControls({ start: onStart }, { Space: onStart, Enter: onStart })

  return (
    <>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 pb-28 sm:p-6 sm:pb-28">
        {tab === 'start' && (
          <>
            <h1 className="sr-only">Biʼire: start a lecture</h1>
            <div className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-6">
              <button
                type="button"
                onClick={onStart}
                aria-describedby="start-hint"
                className="flex aspect-square w-[min(80vw,52dvh,26rem)] flex-col items-center justify-center gap-3 rounded-full bg-accent font-display text-4xl font-bold text-on-accent shadow-lg ring-accent/30 transition-[filter] duration-200 hover:brightness-110 sm:text-5xl data-[on=true]:ring-[1.25rem]"
                data-on={listening}
              >
                <Microphone aria-hidden="true" weight="bold" className="size-[1.6em]" />
                Start class
                <Wave on={listening} />
              </button>
              <p id="start-hint" className="text-center text-xl font-medium text-muted-foreground">
                {listening
                  ? shortcuts
                    ? 'Listening… say "start class", tap, or press Space'
                    : 'Listening… say "start class" or tap'
                  : shortcuts
                    ? 'Tap or press Space to start'
                    : 'Tap to start'}
              </p>
            </div>
          </>
        )}

        {tab === 'notebooks' && (
          <section aria-labelledby="notebooks-title" className="flex flex-col gap-4">
            <h1 id="notebooks-title" className="flex items-center gap-2 text-3xl font-bold">
              <BookOpenText aria-hidden="true" weight="bold" className="size-8" />
              Your notebooks
            </h1>
            {notes.length === 0 ? (
              <p className="text-xl text-muted-foreground">No notes yet. Start a class and your notes will appear here.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onOpenNote(n.id)}
                      className="flex min-h-16 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-muted px-5 py-3 text-left text-xl transition-colors duration-200 hover:bg-border"
                    >
                      <span className="font-semibold">{n.title}</span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {n.course_name} · {new Date(n.created_at * 1000).toLocaleDateString()}
                        <CaretRight aria-hidden="true" weight="bold" className="size-5" />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === 'settings' && (
          <section aria-labelledby="setup-title" className="flex flex-col gap-6">
            <h1 id="setup-title" className="flex items-center gap-2 text-3xl font-bold">
              <GearSix aria-hidden="true" weight="bold" className="size-8" />
              Class setup
            </h1>
            <div className="grid gap-6 md:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-2 text-xl font-semibold">
                Course
                <input
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  autoComplete="off"
                  className="min-h-14 w-full min-w-0 rounded-xl border-2 border-border bg-background px-4 text-2xl text-foreground"
                />
              </label>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-2 text-xl font-semibold">Notes language</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {LANG_LABELS.map(([code, label]) => (
                    <Toggle key={code} lang={code} pressed={lang === code} onClick={() => setLang(code)}>
                      {label}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-2 text-xl font-semibold">Time to answer quiz questions</legend>
                <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-3">
                  {ANSWER_TIMES.map((s) => (
                    <Toggle key={s} pressed={answerSec === s} onClick={() => setAnswerSec(s)}>
                      {`${s} sec`}
                    </Toggle>
                  ))}
                </div>
              </fieldset>
              <fieldset className="flex min-w-0 flex-col gap-2">
                <legend className="mb-2 text-xl font-semibold">Single-key shortcuts (Space, Q, N…)</legend>
                <div className="grid grid-cols-2 gap-2">
                  <Toggle pressed={shortcuts} onClick={() => setShortcuts(true)}>
                    On
                  </Toggle>
                  <Toggle pressed={!shortcuts} onClick={() => setShortcuts(false)}>
                    Off
                  </Toggle>
                </div>
              </fieldset>
            </div>
          </section>
        )}
      </main>

      <nav aria-label="Home sections" className="fixed inset-x-0 bottom-0 z-10 border-t-2 border-border bg-card">
        <ul className="mx-auto grid max-w-4xl grid-cols-3">
          {TABS.map(({ id, label, icon: TabIcon }) => {
            const current = tab === id
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-current={current ? 'page' : undefined}
                  onClick={() => setTab(id)}
                  className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 py-2 text-base font-bold transition-colors duration-200 ${
                    current ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <TabIcon aria-hidden="true" weight={current ? 'fill' : 'bold'} className="size-7" />
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
