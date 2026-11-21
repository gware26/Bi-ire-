import { useEffect, useState } from 'react'
import { CalendarCheck, ChatCircleText, Cards, FileText, Notebook } from '@phosphor-icons/react'
import type { Note } from '../lib/api'
import type { Actions } from '../lib/hooks'
import { announce } from '../lib/announce'
import { stopSpeaking } from '../lib/voice'
import { TabBar, type TabDef } from '../components/TabBar'
import { Notes } from './Notes'
import { Flashcards } from './study/Flashcards'
import { Ask } from './study/Ask'
import { Plan } from './study/Plan'
import { Materials } from './study/Materials'

export type StudyTab = 'notes' | 'cards' | 'ask' | 'plan' | 'materials'

const TABS: TabDef<StudyTab>[] = [
  { id: 'notes', label: 'Notes', icon: Notebook },
  { id: 'cards', label: 'Cards', icon: Cards },
  { id: 'ask', label: 'Ask', icon: ChatCircleText },
  { id: 'plan', label: 'Plan', icon: CalendarCheck },
  { id: 'materials', label: 'Materials', icon: FileText },
]

interface Props {
  note: Note
  answerSec: number
  onQuiz: () => void
  onNewClass: () => void
  onHome: () => void
}

/** Study mode for one lecture: notes, flashcards, tutor chat, study plan and uploaded materials. */
export function Study({ note, answerSec, onQuiz, onNewClass, onHome }: Props) {
  const [tab, setTab] = useState<StudyTab>('notes')
  const [focus, setFocus] = useState<number | null>(null)

  function go(next: StudyTab) {
    stopSpeaking()
    setFocus(null)
    setTab(next)
    const label = TABS.find((t) => t.id === next)?.label ?? next
    announce(label)
  }

  /** Source links in other tabs jump to that transcript part on the Notes tab. */
  function openSource(id: number) {
    stopSpeaking()
    setFocus(id)
    setTab('notes')
  }

  useEffect(() => {
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [tab])

  useEffect(() => stopSpeaking, [])

  // Tab switching + quiz work on every study tab (each tab merges these in).
  const switching: Actions = {
    notes: () => go('notes'),
    cards: () => go('cards'),
    ask: () => go('ask'),
    plan: () => go('plan'),
    materials: () => go('materials'),
    quiz: onQuiz,
  }

  return (
    <>
      <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-28 md:p-6 md:pb-28">
        {tab === 'notes' && (
          <Notes
            key={focus ?? 'notes'}
            note={note}
            initialFocus={focus}
            onQuiz={onQuiz}
            onNewClass={onNewClass}
            onHome={onHome}
            extraCommands={switching}
          />
        )}
        {tab === 'cards' && <Flashcards note={note} onOpenSource={openSource} extraCommands={switching} onHome={onHome} />}
        {tab === 'ask' && (
          <Ask note={note} answerSec={answerSec} onOpenSource={openSource} extraCommands={switching} onHome={onHome} />
        )}
        {tab === 'plan' && <Plan note={note} extraCommands={switching} onHome={onHome} />}
        {tab === 'materials' && <Materials note={note} onOpenSource={openSource} extraCommands={switching} onHome={onHome} />}
      </main>
      <TabBar label="Study sections" tabs={TABS} current={tab} onChange={go} />
    </>
  )
}
