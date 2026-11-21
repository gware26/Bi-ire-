import { useEffect, useState } from 'react'
import { BookOpenText, CaretRight, Check, Microphone } from '@phosphor-icons/react'
import { api, type Lang, type NoteSummary } from '../lib/api'
import { useControls } from '../lib/hooks'
import { BigButton } from '../components/BigButton'

const LANG_LABELS: [Lang, string][] = [
  ['en', 'English'],
  ['am', 'አማርኛ'],
  ['om', 'Afaan Oromoo'],
]

export const ANSWER_TIMES = [8, 15, 30]

interface Props {
  course: string
  setCourse: (c: string) => void
  lang: Lang
  setLang: (l: Lang) => void
  answerSec: number
  setAnswerSec: (s: number) => void
  shortcuts: boolean
  setShortcuts: (on: boolean) => void
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

export function Home(props: Props) {
  const { course, setCourse, lang, setLang, answerSec, setAnswerSec, shortcuts, setShortcuts, onStart, onOpenNote } = props
  const [notes, setNotes] = useState<NoteSummary[]>([])

  useEffect(() => {
    api.listNotes().then(setNotes).catch(() => setNotes([]))
  }, [])

  useControls({ start: onStart }, { Space: onStart, Enter: onStart })

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <h1 className="sr-only">LissanNote: start a lecture</h1>
      <BigButton
        onClick={onStart}
        size="xl"
        icon={Microphone}
        hint={shortcuts ? 'Say "start class", tap, or press Space' : 'Say "start class" or tap'}
        className="min-h-[45vh]"
      >
        Start class
      </BigButton>

      <section aria-labelledby="setup-title" className="flex flex-col gap-6 rounded-2xl border-2 border-border bg-card p-4 sm:p-6">
        <h2 id="setup-title" className="text-2xl font-bold">
          Class setup
        </h2>
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

      {notes.length > 0 && (
        <section aria-labelledby="notebooks-title" className="rounded-2xl border-2 border-border bg-card p-4 sm:p-6">
          <h2 id="notebooks-title" className="mb-4 flex items-center gap-2 text-2xl font-bold">
            <BookOpenText aria-hidden="true" weight="bold" className="size-7" />
            Your notebooks
          </h2>
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
        </section>
      )}
    </main>
  )
}
