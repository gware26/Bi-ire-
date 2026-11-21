import { useEffect, useState } from 'react'
import { BookOpenText, CaretRight, Check, GearSix, Microphone, PencilSimple } from '@phosphor-icons/react'
import { api, type Lang, type NoteSummary } from '../lib/api'
import { useControls } from '../lib/hooks'
import { announce } from '../lib/announce'
import { TabBar, type TabDef } from '../components/TabBar'
import { BigButton } from '../components/BigButton'

const LANG_LABELS: [Lang, string][] = [
  ['en', 'English'],
  ['am', 'አማርኛ'],
  ['om', 'Afaan Oromoo'],
]

export const ANSWER_TIMES = [8, 15, 30]

type Tab = 'start' | 'notebooks' | 'settings'

const TABS: TabDef<Tab>[] = [
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
  onSpeakNote: () => void
  onOpenNote: (id: number) => void
}

export function Toggle({ pressed, onClick, children, lang }: { pressed: boolean; onClick: () => void; children: string; lang?: string }) {
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
  const {
    course,
    setCourse,
    lang,
    setLang,
    answerSec,
    setAnswerSec,
    shortcuts,
    setShortcuts,
    listening,
    onStart,
    onSpeakNote,
    onOpenNote,
  } = props
  const [tab, setTab] = useState<Tab>('start')
  const [notes, setNotes] = useState<NoteSummary[]>([])

  useEffect(() => {
    api.listNotes().then(setNotes).catch(() => setNotes([]))
  }, [tab])

  function goTab(next: Tab, label: string) {
    setTab(next)
    announce(label)
  }

  useControls(
    {
      start: onStart,
      speaknote: () => {
        setTab('notebooks')
        onSpeakNote()
      },
      starttab: () => goTab('start', 'Start'),
      notebooks: () => goTab('notebooks', 'Notebooks'),
      settings: () => goTab('settings', 'Settings'),
    },
    tab === 'start'
      ? { Space: onStart, Enter: onStart }
      : tab === 'notebooks'
        ? { Space: onSpeakNote, n: onSpeakNote }
        : {},
  )

  const notebooks = notes.reduce<{ course: string; notes: NoteSummary[] }[]>((groups, n) => {
    const courseName = n.course_name || 'My notes'
    const g = groups.find((x) => x.course === courseName)
    if (g) g.notes.push(n)
    else groups.push({ course: courseName, notes: [n] })
    return groups
  }, [])

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
          <section aria-labelledby="notebooks-title" className="flex flex-col gap-5">
            <h1 id="notebooks-title" className="flex items-center gap-2 text-3xl font-bold">
              <BookOpenText aria-hidden="true" weight="bold" className="size-8" />
              Your notebooks
            </h1>
            <p className="text-xl text-muted-foreground">
              Speak a note with your voice and Biʼire saves it here, next to your lecture notes.
            </p>
            <BigButton
              tone="accent"
              icon={PencilSimple}
              onClick={onSpeakNote}
              hint={shortcuts ? 'Say "take a note", tap, or press Space' : 'Say "take a note" or tap'}
              className="min-h-[22vh]"
            >
              Speak a note
            </BigButton>

            {notes.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-border p-6 text-xl text-muted-foreground">
                No notes yet. Speak a note, or start a class.
              </p>
            ) : (
              <div className="flex flex-col gap-6">
                {notebooks.map((nb) => (
                  <section key={nb.course} aria-labelledby={`nb-${nb.course}`}>
                    <h2 id={`nb-${nb.course}`} className="mb-3 text-2xl font-bold text-primary">
                      {nb.course}
                      <span className="ml-2 text-lg font-medium text-muted-foreground">
                        {nb.notes.length} {nb.notes.length === 1 ? 'note' : 'notes'}
                      </span>
                    </h2>
                    <ul className="flex flex-col gap-2">
                      {nb.notes.map((n) => (
                        <li key={n.id}>
                          <button
                            type="button"
                            onClick={() => onOpenNote(n.id)}
                            className="flex min-h-16 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl bg-muted px-5 py-3 text-left text-xl transition-colors duration-200 hover:bg-border"
                          >
                            <span className="font-semibold">{n.title}</span>
                            <span className="flex items-center gap-2 text-muted-foreground">
                              {new Date(n.created_at * 1000).toLocaleDateString()}
                              <CaretRight aria-hidden="true" weight="bold" className="size-5" />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
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
              <div className="flex min-w-0 flex-col gap-2">
                <label htmlFor="course" className="text-xl font-semibold">
                  Course (optional)
                </label>
                <input
                  id="course"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  autoComplete="off"
                  placeholder="Detected automatically"
                  aria-describedby="course-hint"
                  className="min-h-14 w-full min-w-0 rounded-xl border-2 border-border bg-background px-4 text-2xl text-foreground placeholder:text-muted-foreground"
                />
                <p id="course-hint" className="text-base text-muted-foreground">
                  Leave empty and Biʼire will work out the subject from the lecture.
                </p>
              </div>
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

      <TabBar label="Home sections" tabs={TABS} current={tab} onChange={setTab} />
    </>
  )
}
