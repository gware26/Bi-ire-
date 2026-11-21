import { useEffect, useRef, useState } from 'react'
import { FileArrowUp, FileText, LinkSimple, Plus, SpeakerHigh, Trash, Warning } from '@phosphor-icons/react'
import { api, type Material, type Note } from '../../lib/api'
import { useControls, type Actions } from '../../lib/hooks'
import { announce } from '../../lib/announce'
import { cues, speak, stopSpeaking } from '../../lib/voice'
import { BigButton } from '../../components/BigButton'
import { Sources } from '../Notes'

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.md,application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown'

interface Props {
  note: Note
  onOpenSource: (id: number) => void
  extraCommands: Actions
  onHome: () => void
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function script(m: Material) {
  const a = m.analysis
  if (!a) return m.filename
  return [
    `${m.filename}. ${a.summary}`,
    a.links.length ? 'How it connects to your lecture.' : '',
    ...a.links.map((l) => l.point),
    a.extra.length ? 'Only in this material.' : '',
    ...a.extra,
  ]
    .filter(Boolean)
    .join('\n')
}

export function Materials({ note, onOpenSource, extraCommands, onHome }: Props) {
  const [materials, setMaterials] = useState<Material[]>([])
  const [uploading, setUploading] = useState('')
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.listMaterials(note.id).then(setMaterials).catch(() => {})
    return stopSpeaking
  }, [note.id])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setError('')
    setWarning('')
    for (const file of Array.from(files)) {
      setUploading(file.name)
      try {
        const m = await api.uploadMaterial(note.id, file)
        setMaterials((list) => [...list, m])
        if (m.warning) setWarning(m.warning)
        cues.correct()
        announce(`${file.name} added${m.analysis ? ' and linked to your lecture' : ''}`)
      } catch (e) {
        cues.error()
        setError(`${file.name}: ${e instanceof Error ? e.message : 'upload failed'}`)
      }
    }
    setUploading('')
    if (input.current) input.current.value = ''
  }

  async function remove(m: Material) {
    if (!window.confirm(`Remove ${m.filename}?`)) return
    try {
      await api.deleteMaterial(m.id)
      setMaterials((list) => list.filter((x) => x.id !== m.id))
      announce(`${m.filename} removed`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove the file')
    }
  }

  useControls({ ...extraCommands, home: onHome })

  return (
    <>
      <h1 className="flex items-center gap-3 text-3xl font-bold">
        <FileText aria-hidden="true" weight="bold" className="size-8 shrink-0" />
        Materials
      </h1>
      <p className="text-xl text-muted-foreground">
        Add slides, handouts or book pages. Biʼire links them to what was said in the lecture, and uses them for flashcards,
        the tutor and your study plan.
      </p>

      <input
        ref={input}
        id="material-file"
        type="file"
        multiple
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => upload(e.target.files)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <BigButton
        tone="accent"
        icon={uploading ? FileArrowUp : Plus}
        onClick={() => input.current?.click()}
        disabled={Boolean(uploading)}
        hint="PDF, photo (PNG/JPG) or text file, up to 8 MB. Save Word or PowerPoint as PDF."
      >
        {uploading ? 'Reading your file…' : 'Add material'}
      </BigButton>

      {uploading && (
        <p role="status" className="flex items-center gap-3 text-xl text-muted-foreground">
          <span aria-hidden="true" className="size-6 animate-spin rounded-full border-4 border-muted border-t-primary" />
          Reading {uploading} and linking it to your lecture…
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-2 text-lg font-semibold text-destructive">
          <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
          {error}
        </p>
      )}
      {warning && (
        <p role="status" className="flex items-center gap-2 text-lg font-semibold text-muted-foreground">
          <Warning aria-hidden="true" weight="bold" className="size-6 shrink-0" />
          {warning}
        </p>
      )}

      {materials.length === 0 && !uploading && (
        <p className="rounded-2xl border-2 border-dashed border-border p-6 text-xl text-muted-foreground">No materials yet.</p>
      )}

      <ul className="flex flex-col gap-4">
        {materials.map((m) => (
          <li key={m.id} className="flex flex-col gap-3 rounded-2xl border-2 border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex min-w-0 items-center gap-2 text-2xl font-bold">
                <FileText aria-hidden="true" weight="bold" className="size-7 shrink-0" />
                <span className="break-all">{m.filename}</span>
                <span className="shrink-0 text-base font-medium text-muted-foreground">{kb(m.size)}</span>
              </h2>
              <span className="flex gap-2">
                <button
                  type="button"
                  onClick={() => speak(script(m), note.out_lang)}
                  className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-border px-3 text-lg font-semibold hover:bg-muted"
                >
                  <SpeakerHigh aria-hidden="true" weight="bold" className="size-6" />
                  Listen<span className="sr-only"> to {m.filename}</span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(m)}
                  className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-border px-3 text-lg font-semibold text-destructive hover:bg-muted"
                >
                  <Trash aria-hidden="true" weight="bold" className="size-6" />
                  Remove<span className="sr-only"> {m.filename}</span>
                </button>
              </span>
            </div>
            {m.analysis ? (
              <div lang={note.out_lang} className="flex flex-col gap-3 text-xl">
                <p>{m.analysis.summary}</p>
                {m.analysis.links.length > 0 && (
                  <>
                    <h3 className="flex items-center gap-2 text-lg font-bold text-primary">
                      <LinkSimple aria-hidden="true" weight="bold" className="size-5" />
                      Connects to your lecture
                    </h3>
                    <ul className="flex flex-col gap-2">
                      {m.analysis.links.map((l, i) => (
                        <li key={i} className="rounded-xl bg-muted px-4 py-2">
                          {l.point}
                          <Sources ids={l.source_ids} onOpen={onOpenSource} />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {m.analysis.extra.length > 0 && (
                  <>
                    <h3 className="text-lg font-bold text-highlight">Only in this material (not said in class)</h3>
                    <ul className="flex list-disc flex-col gap-1 pl-6">
                      {m.analysis.extra.map((x, i) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              <p className="text-lg text-muted-foreground">Not linked to the lecture yet.</p>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
