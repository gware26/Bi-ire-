import { useEffect, useState } from 'react'
import { ArrowClockwise, CalendarCheck, Clock, SpeakerHigh, Stop, Target, Warning } from '@phosphor-icons/react'
import { api, type Note, type StudyPlan } from '../../lib/api'
import { useControls, type Actions } from '../../lib/hooks'
import { announce } from '../../lib/announce'
import { speak, stopSpeaking } from '../../lib/voice'
import { BigButton } from '../../components/BigButton'
import { Toggle } from '../Home'

const DAY_CHOICES = [3, 7, 14]
const MINUTE_CHOICES = [15, 30, 60]

interface Props {
  note: Note
  extraCommands: Actions
  onHome: () => void
}

function planScript(plan: StudyPlan) {
  return [
    plan.goal,
    ...plan.days.map((d) => `Day ${d.day}: ${d.focus}. ${d.minutes} minutes. ${d.tasks.join('. ')}.`),
  ].join('\n')
}

export function Plan({ note, extraCommands, onHome }: Props) {
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [days, setDays] = useState(7)
  const [minutes, setMinutes] = useState(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reading, setReading] = useState(false)

  useEffect(() => {
    api
      .getPlan(note.id)
      .then(({ plan }) => {
        if (plan) {
          setPlan(plan)
          setDays(plan.params[0])
          setMinutes(plan.params[1])
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
    return stopSpeaking
  }, [note.id])

  async function generate(refresh = false) {
    stopSpeaking()
    setReading(false)
    setLoading(true)
    setError('')
    try {
      const r = await api.makePlan(note.id, days, minutes, refresh)
      setPlan(r.plan)
      announce(`Your ${r.plan.days.length}-day study plan is ready`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not make a study plan')
    } finally {
      setLoading(false)
    }
  }

  async function toggleRead() {
    if (!plan) return
    if (reading) {
      stopSpeaking()
      setReading(false)
      return
    }
    setReading(true)
    await speak(planScript(plan), note.out_lang)
    setReading(false)
  }

  useControls({ ...extraCommands, read: toggleRead, home: onHome }, { Space: toggleRead })

  const outdated = plan && (plan.params[0] !== days || plan.params[1] !== minutes)

  return (
    <>
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <CalendarCheck aria-hidden="true" weight="bold" className="size-8 shrink-0" />
        Study plan
      </h1>

      <section aria-label="Plan settings" className="grid gap-5 rounded-2xl border-2 border-border bg-card p-5 md:grid-cols-2">
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-xl font-semibold">Days until the exam</legend>
          <div className="grid grid-cols-3 gap-2">
            {DAY_CHOICES.map((d) => (
              <Toggle key={d} pressed={days === d} onClick={() => setDays(d)}>
                {`${d} days`}
              </Toggle>
            ))}
          </div>
        </fieldset>
        <fieldset className="flex min-w-0 flex-col gap-2">
          <legend className="mb-2 text-xl font-semibold">Time per day</legend>
          <div className="grid grid-cols-3 gap-2">
            {MINUTE_CHOICES.map((m) => (
              <Toggle key={m} pressed={minutes === m} onClick={() => setMinutes(m)}>
                {`${m} min`}
              </Toggle>
            ))}
          </div>
        </fieldset>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        <BigButton
          tone="accent"
          icon={plan ? ArrowClockwise : CalendarCheck}
          onClick={() => generate(Boolean(plan) && !outdated)}
          disabled={loading}
          hint="Uses the lecture and your materials"
        >
          {plan ? (outdated ? 'Update plan' : 'Make a new plan') : 'Make my plan'}
        </BigButton>
        {plan && (
          <BigButton tone="primary" icon={reading ? Stop : SpeakerHigh} onClick={toggleRead} hint='Say "read notes" or press Space'>
            {reading ? 'Stop reading' : 'Read plan aloud'}
          </BigButton>
        )}
      </div>

      {loading && (
        <p role="status" className="flex items-center gap-3 text-2xl text-muted-foreground">
          <span aria-hidden="true" className="size-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          {plan ? 'Updating your plan…' : 'Loading…'}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-2 text-xl font-semibold text-destructive">
          <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
          {error}
        </p>
      )}

      {plan && !loading && (
        <>
          <p lang={note.out_lang} className="flex items-start gap-3 rounded-2xl bg-muted p-5 text-2xl font-semibold">
            <Target aria-hidden="true" weight="bold" className="mt-1 size-7 shrink-0 text-accent" />
            {plan.goal}
          </p>
          <ol className="flex flex-col gap-3">
            {plan.days.map((d) => (
              <li key={d.day} className="rounded-2xl border-2 border-l-8 border-border border-l-primary bg-card p-5">
                <h2 className="flex flex-wrap items-baseline justify-between gap-2 text-2xl font-bold">
                  <span>
                    Day {d.day}: <span lang={note.out_lang}>{d.focus}</span>
                  </span>
                  <span className="flex items-center gap-1 text-lg font-semibold text-muted-foreground">
                    <Clock aria-hidden="true" weight="bold" className="size-5" />
                    {d.minutes} min
                  </span>
                </h2>
                <ul lang={note.out_lang} className="mt-3 flex list-disc flex-col gap-1 pl-6 text-xl">
                  {d.tasks.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
