import { useEffect, useState } from 'react'
import { ArrowClockwise, ArrowLeft, ArrowRight, Cards, FileText, SpeakerHigh, SpeakerSlash, Warning } from '@phosphor-icons/react'
import { api, type Flashcard, type Note } from '../../lib/api'
import { useControls, useStoredState, type Actions } from '../../lib/hooks'
import { announce } from '../../lib/announce'
import { speak, stopSpeaking } from '../../lib/voice'
import { BigButton } from '../../components/BigButton'
import { Sources } from '../Notes'

interface Props {
  note: Note
  onOpenSource: (id: number) => void
  extraCommands: Actions
  onHome: () => void
}

export function Flashcards({ note, onOpenSource, extraCommands, onHome }: Props) {
  const [cards, setCards] = useState<Flashcard[] | null>(null)
  const [error, setError] = useState('')
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [autoRead, setAutoRead] = useStoredState('ln.cards.autoRead', true)

  async function load(refresh = false) {
    setCards(null)
    setError('')
    try {
      const r = await api.flashcards(note.id, refresh)
      setCards(r.cards)
      setIndex(0)
      setFlipped(false)
      announce(`${r.cards.length} flashcards ready`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make flashcards')
    }
  }

  useEffect(() => {
    load()
    return stopSpeaking
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id])

  const card = cards?.[index]

  useEffect(() => {
    if (!card || !autoRead) return
    speak(flipped ? card.back : card.front, note.out_lang)
  }, [card, flipped, autoRead, note.out_lang])

  function flip() {
    if (card) setFlipped((f) => !f)
  }
  function move(step: number) {
    if (!cards?.length) return
    setIndex((i) => (i + step + cards.length) % cards.length)
    setFlipped(false)
  }

  useControls(
    { ...extraCommands, flip, next: () => move(1), previous: () => move(-1), home: onHome },
    { Space: flip, ArrowRight: () => move(1), ArrowLeft: () => move(-1), r: () => card && speak(flipped ? card.back : card.front, note.out_lang) },
  )

  return (
    <>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-3xl font-bold">
          <Cards aria-hidden="true" weight="bold" className="size-8 shrink-0" />
          Flashcards
        </h1>
        {cards && cards.length > 0 && (
          <span className="text-2xl font-bold tabular-nums" aria-label={`Card ${index + 1} of ${cards.length}`}>
            {index + 1} / {cards.length}
          </span>
        )}
      </header>

      {!cards && !error && (
        <p role="status" className="flex items-center gap-3 text-2xl text-muted-foreground">
          <span aria-hidden="true" className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          Making flashcards from your lecture and materials…
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-2 text-xl font-semibold text-destructive">
          <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
          {error}
        </p>
      )}
      {cards && cards.length === 0 && <p className="text-xl text-muted-foreground">No flashcards could be made from this lecture.</p>}

      {card && (
        <>
          <button
            type="button"
            onClick={flip}
            aria-label={`${flipped ? 'Answer' : 'Question'}: ${flipped ? card.back : card.front}. Tap to ${flipped ? 'see the question' : 'show the answer'}.`}
            className={`flex min-h-[38vh] flex-col items-center justify-center gap-4 rounded-3xl border-4 p-8 text-center shadow-sm transition-colors duration-200 ${
              flipped ? 'border-accent bg-card' : 'border-primary bg-card'
            }`}
          >
            <span className={`text-lg font-bold uppercase tracking-wide ${flipped ? 'text-accent' : 'text-primary'}`}>
              {flipped ? 'Answer' : 'Question'}
            </span>
            <span lang={note.out_lang} className="max-w-[30ch] font-display text-3xl font-bold leading-snug sm:text-4xl">
              {flipped ? card.back : card.front}
            </span>
          </button>
          <p className="flex flex-wrap items-center gap-2 text-lg text-muted-foreground">
            {card.source === 'lecture' ? (
              <>
                From the lecture
                <Sources ids={card.source_ids} onOpen={onOpenSource} />
              </>
            ) : (
              <>
                <FileText aria-hidden="true" weight="bold" className="size-5" />
                From {card.source}
              </>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <BigButton tone="neutral" icon={ArrowLeft} onClick={() => move(-1)} hint='"Previous" or ←'>
              Previous
            </BigButton>
            <BigButton tone="primary" icon={ArrowClockwise} onClick={flip} hint='"Flip" or Space'>
              Flip
            </BigButton>
            <BigButton tone="accent" icon={ArrowRight} onClick={() => move(1)} hint='"Next" or →'>
              Next
            </BigButton>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          aria-pressed={autoRead}
          onClick={() => {
            if (autoRead) stopSpeaking()
            setAutoRead(!autoRead)
          }}
          className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-border px-4 text-lg font-semibold hover:bg-muted"
        >
          {autoRead ? (
            <SpeakerHigh aria-hidden="true" weight="bold" className="size-6" />
          ) : (
            <SpeakerSlash aria-hidden="true" weight="bold" className="size-6" />
          )}
          Read cards aloud: {autoRead ? 'On' : 'Off'}
        </button>
        {cards && (
          <button
            type="button"
            onClick={() => load(true)}
            className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-border px-4 text-lg font-semibold hover:bg-muted"
          >
            <ArrowClockwise aria-hidden="true" weight="bold" className="size-6" />
            New set of cards
          </button>
        )}
      </div>
    </>
  )
}
