import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  BookmarkSimple,
  CaretDown,
  CaretRight,
  Exam,
  ListChecks,
  Microphone,
  Question,
  SpeakerHigh,
  Stop,
  TextAa,
  Warning,
  type Icon,
} from '@phosphor-icons/react'
import type { Note } from '../lib/api'
import { useControls } from '../lib/hooks'
import { hasVoice, speak, stopSpeaking } from '../lib/voice'
import { BigButton } from '../components/BigButton'

interface Props {
  note: Note
  onQuiz: () => void
  onNewClass: () => void
  onHome: () => void
}

function notesScript(note: Note) {
  const parts = [note.title + '.', note.summary]
  if (note.definitions.length) {
    parts.push('Key definitions.', ...note.definitions.map((d) => `${d.term}: ${d.definition}`))
  }
  if (note.exam_hints.length) parts.push('Exam hints.', ...note.exam_hints.map((h) => h.text))
  if (note.takeaways.length) parts.push('Main takeaways.', ...note.takeaways.map((t) => t.text))
  return parts.join('\n')
}

function Sources({ ids, onOpen }: { ids: number[]; onOpen: (id: number) => void }) {
  if (!ids.length) return null
  return (
    <span className="ml-2 inline-flex flex-wrap gap-2 align-middle">
      {ids.map((id) => (
        <a
          key={id}
          href={`#seg-${id}`}
          onClick={(e) => {
            e.preventDefault()
            onOpen(id)
          }}
          aria-label={`Source: transcript part ${id}`}
          className="inline-flex min-h-7 min-w-7 items-center justify-center rounded-md bg-muted px-2 py-1 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:bg-border"
        >
          #{id}
        </a>
      ))}
    </span>
  )
}

const SECTION_BORDER = {
  highlight: 'border-l-highlight',
  primary: 'border-l-primary',
  accent: 'border-l-accent',
}

function NoteSection(props: { title: string; icon: Icon; tone: keyof typeof SECTION_BORDER; children: ReactNode }) {
  const IconCmp = props.icon
  return (
    <section className={`rounded-2xl border-2 border-l-8 border-border bg-card p-6 ${SECTION_BORDER[props.tone]}`}>
      <h2 className="mb-4 flex items-center gap-3 text-2xl font-bold">
        <IconCmp aria-hidden="true" weight="bold" className="size-7 shrink-0" />
        {props.title}
      </h2>
      {props.children}
    </section>
  )
}

export function Notes({ note, onQuiz, onNewClass, onHome }: Props) {
  const [reading, setReading] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)
  const [focusSegment, setFocusSegment] = useState<number | null>(null)

  async function toggleRead() {
    if (reading) {
      stopSpeaking()
      setReading(false)
      return
    }
    setReading(true)
    await speak(notesScript(note), note.out_lang)
    setReading(false)
  }

  function startQuiz() {
    stopSpeaking()
    onQuiz()
  }

  useControls(
    { read: toggleRead, quiz: startQuiz, start: onNewClass, home: onHome },
    { Space: toggleRead, q: startQuiz, n: onNewClass, h: onHome },
  )

  function openSource(id: number) {
    setShowTranscript(true)
    setFocusSegment(id)
  }

  useEffect(() => {
    if (focusSegment === null) return
    const el = document.getElementById(`seg-${focusSegment}`)
    el?.scrollIntoView({ block: 'center' })
    el?.focus({ preventScroll: true })
    setFocusSegment(null)
  }, [focusSegment])

  const bookmarkedIds = new Set(
    note.bookmarks
      .map((b) => [...note.segments].reverse().find((s) => s.start_sec <= b.at_sec)?.id)
      .filter((id): id is number => id !== undefined),
  )

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex min-h-screen max-w-5xl flex-col gap-5 p-4 md:p-6">
      <header className="rounded-2xl border-2 border-border bg-card p-6">
        <p className="text-lg font-semibold text-muted-foreground">{note.course_name}</p>
        <h1 lang={note.out_lang} className="text-4xl font-bold">
          {note.title}
        </h1>
        <p lang={note.out_lang} className="mt-3 max-w-[70ch] text-2xl leading-relaxed">
          {note.summary}
        </p>
        {note.out_lang !== 'en' && !hasVoice(note.out_lang) && (
          <p className="mt-4 flex items-center gap-2 text-base font-semibold text-muted-foreground">
            <Warning aria-hidden="true" weight="bold" className="size-5 shrink-0" />
            No {note.out_lang === 'am' ? 'Amharic' : 'Afaan Oromo'} voice is installed in this browser, so read-aloud may
            use a fallback voice.
          </p>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <BigButton
          tone="primary"
          icon={reading ? Stop : SpeakerHigh}
          onClick={toggleRead}
          hint='Say "read notes" or press Space'
        >
          {reading ? 'Stop reading' : 'Read aloud'}
        </BigButton>
        <BigButton tone="highlight" icon={Question} onClick={startQuiz} hint='Say "quiz me" or press Q'>
          Quiz me
        </BigButton>
        <BigButton tone="neutral" icon={Microphone} onClick={onNewClass} hint='Say "start class" or press N'>
          New class
        </BigButton>
      </div>

      <NoteSection title="Exam hints" icon={Exam} tone="highlight">
        <ul lang={note.out_lang} className="flex flex-col gap-3 text-2xl">
          {note.exam_hints.map((h, i) => (
            <li key={i} className="max-w-[70ch]">
              {h.text}
              <Sources ids={h.source_ids} onOpen={openSource} />
            </li>
          ))}
        </ul>
      </NoteSection>

      <NoteSection title="Key definitions" icon={TextAa} tone="primary">
        <dl lang={note.out_lang} className="flex flex-col gap-3 text-2xl">
          {note.definitions.map((d, i) => (
            <div key={i} className="max-w-[70ch]">
              <dt className="inline font-bold">{d.term}: </dt>
              <dd className="inline">
                {d.definition}
                <Sources ids={d.source_ids} onOpen={openSource} />
              </dd>
            </div>
          ))}
        </dl>
      </NoteSection>

      <NoteSection title="Main takeaways" icon={ListChecks} tone="accent">
        <ul lang={note.out_lang} className="flex flex-col gap-3 text-2xl">
          {note.takeaways.map((t, i) => (
            <li key={i} className="max-w-[70ch]">
              {t.text}
              <Sources ids={t.source_ids} onOpen={openSource} />
            </li>
          ))}
        </ul>
      </NoteSection>

      <section className="rounded-2xl border-2 border-border bg-card p-6">
        <button
          type="button"
          onClick={() => setShowTranscript((v) => !v)}
          className="flex min-h-12 items-center gap-2 text-2xl font-bold"
          aria-expanded={showTranscript}
          aria-controls="transcript-parts"
        >
          {showTranscript ? (
            <CaretDown aria-hidden="true" weight="bold" className="size-6" />
          ) : (
            <CaretRight aria-hidden="true" weight="bold" className="size-6" />
          )}
          Original transcript ({note.segments.length} parts)
        </button>
        <div id="transcript-parts" lang="" className={`${showTranscript ? '' : 'hidden'} mt-4 flex flex-col gap-3 text-xl`}>
          {note.segments.map((s) => (
            <p
              key={s.id}
              id={`seg-${s.id}`}
              tabIndex={-1}
              lang={s.langs.length === 1 ? s.langs[0] : undefined}
              className={`rounded-xl border-2 p-3 ${
                bookmarkedIds.has(s.id) ? 'border-highlight bg-muted' : 'border-transparent bg-muted'
              }`}
            >
              <span className="mr-2 font-bold text-muted-foreground">#{s.id}</span>
              {bookmarkedIds.has(s.id) && (
                <span className="mr-2 inline-flex items-center gap-1 rounded-md bg-highlight px-2 py-0.5 align-middle text-sm font-bold text-on-highlight">
                  <BookmarkSimple aria-hidden="true" weight="fill" className="size-4" />
                  Bookmarked
                </span>
              )}
              {s.text}
            </p>
          ))}
        </div>
      </section>

      <button
        type="button"
        onClick={onHome}
        className="flex min-h-12 items-center gap-2 self-start text-xl font-semibold text-muted-foreground underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" weight="bold" className="size-5" />
        Home (H)
      </button>
    </main>
  )
}
