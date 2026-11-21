export type Lang = 'en' | 'am' | 'om'

export interface Segment {
  id: number
  seq: number
  start_sec: number
  end_sec: number
  langs: string[]
  text: string
}

export interface Item {
  text: string
  source_ids: number[]
}

export interface Definition {
  term: string
  definition: string
  source_ids: number[]
}

export interface Note {
  id: number
  session_id: number
  course_name: string
  out_lang: Lang
  title: string
  summary: string
  definitions: Definition[]
  takeaways: Item[]
  exam_hints: Item[]
  created_at: number
  segments: Segment[]
  bookmarks: { at_sec: number; trigger_type: string }[]
}

export interface NoteSummary {
  id: number
  title: string
  course_name: string
  created_at: number
}

export interface QuizQuestion {
  id: number
  question: string
}

export interface QuizResult {
  heard: string
  correct: boolean
  feedback: string
  expected: string
}

export interface MaterialAnalysis {
  summary: string
  links: { point: string; source_ids: number[] }[]
  extra: string[]
}

export interface Material {
  id: number
  filename: string
  mime: string
  size: number
  analysis: MaterialAnalysis | null
  created_at: number
  warning?: string | null
}

export interface Flashcard {
  front: string
  back: string
  source: string
  source_ids: number[]
}

export interface StudyPlan {
  goal: string
  days: { day: number; focus: string; minutes: number; tasks: string[] }[]
  params: [number, number]
}

export interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  text: string
  sources: { source_ids?: number[]; materials?: string[] }
  created_at: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try {
      msg = (await r.json()).detail ?? msg
    } catch {
      // non-JSON error body
    }
    throw Object.assign(new Error(msg), { status: r.status })
  }
  return r.json()
}

/** Retries network failures and 5xx a few times; 4xx answers are final. */
async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 3000): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      const status = (e as { status?: number }).status
      if (i >= attempts || (status !== undefined && status < 500)) throw e
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
}

const post = (body?: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})

export const api = {
  health: () => req<{ ok: boolean; demo_mode: boolean; model: string }>('/health'),

  createSession: (course_name: string) => req<{ session_id: number }>('/sessions', post({ course_name })),

  sendChunk(sessionId: number, wav: Blob, seq: number, startSec: number, endSec: number) {
    const fd = new FormData()
    fd.append('audio', wav, `chunk-${seq}.wav`)
    fd.append('seq', String(seq))
    fd.append('start_sec', startSec.toFixed(2))
    fd.append('end_sec', endSec.toFixed(2))
    return withRetry(() => req<{ segment: Segment | null }>(`/sessions/${sessionId}/chunks`, { method: 'POST', body: fd }))
  },

  bookmark: (sessionId: number, at_sec: number, trigger_type: string) =>
    req<{ id: number; at_sec: number }>(`/sessions/${sessionId}/bookmarks`, post({ at_sec, trigger_type })),

  endSession: (sessionId: number, out_lang: Lang, mode: 'lecture' | 'dictation' = 'lecture') =>
    req<Note>(`/sessions/${sessionId}/end`, post({ out_lang, mode })),

  listNotes: () => req<NoteSummary[]>('/notes'),

  getNote: (id: number) => req<Note>(`/notes/${id}`),

  createQuiz: (noteId: number) =>
    req<{ out_lang: Lang; questions: QuizQuestion[] }>(`/notes/${noteId}/quiz`, { method: 'POST' }),

  answer(attemptId: number, wav: Blob) {
    const fd = new FormData()
    fd.append('audio', wav, 'answer.wav')
    return req<QuizResult>(`/quiz-attempts/${attemptId}/answer`, { method: 'POST', body: fd })
  },

  listMaterials: (noteId: number) => req<Material[]>(`/notes/${noteId}/materials`),

  uploadMaterial(noteId: number, file: File) {
    const fd = new FormData()
    fd.append('file', file, file.name)
    return req<Material>(`/notes/${noteId}/materials`, { method: 'POST', body: fd })
  },

  deleteMaterial: (id: number) => req<{ ok: boolean }>(`/materials/${id}`, { method: 'DELETE' }),

  flashcards: (noteId: number, refresh = false) =>
    req<{ cards: Flashcard[] }>(`/notes/${noteId}/flashcards${refresh ? '?refresh=true' : ''}`, { method: 'POST' }),

  getPlan: (noteId: number) => req<{ plan: StudyPlan | null }>(`/notes/${noteId}/plan`),

  makePlan: (noteId: number, days: number, minutes: number, refresh = false) =>
    req<{ plan: StudyPlan }>(`/notes/${noteId}/plan`, post({ days, minutes, refresh })),

  chatHistory: (noteId: number) => req<ChatMessage[]>(`/notes/${noteId}/chat`),

  ask(noteId: number, question: string | Blob) {
    const fd = new FormData()
    if (typeof question === 'string') fd.append('text', question)
    else fd.append('audio', question, 'question.wav')
    return req<ChatMessage[]>(`/notes/${noteId}/chat`, { method: 'POST', body: fd })
  },
}
