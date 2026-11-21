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

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, init)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try {
      msg = (await r.json()).detail ?? msg
    } catch {
      // non-JSON error body
    }
    throw new Error(msg)
  }
  return r.json()
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
    return req<{ segment: Segment | null }>(`/sessions/${sessionId}/chunks`, { method: 'POST', body: fd })
  },

  bookmark: (sessionId: number, at_sec: number, trigger_type: string) =>
    req<{ id: number; at_sec: number }>(`/sessions/${sessionId}/bookmarks`, post({ at_sec, trigger_type })),

  endSession: (sessionId: number, out_lang: Lang) => req<Note>(`/sessions/${sessionId}/end`, post({ out_lang })),

  listNotes: () => req<NoteSummary[]>('/notes'),

  getNote: (id: number) => req<Note>(`/notes/${id}`),

  createQuiz: (noteId: number) =>
    req<{ out_lang: Lang; questions: QuizQuestion[] }>(`/notes/${noteId}/quiz`, { method: 'POST' }),

  answer(attemptId: number, wav: Blob) {
    const fd = new FormData()
    fd.append('audio', wav, 'answer.wav')
    return req<QuizResult>(`/quiz-attempts/${attemptId}/answer`, { method: 'POST', body: fd })
  },
}
