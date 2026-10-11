import type { Interview, Thread, ThreadStatus } from '../types'

const STATUSES: ThreadStatus[] = ['open', 'partial', 'enough', 'parked', 'spun-off']
const FILE = 'interview.json'

export const isInterviewFile = (path: unknown): path is string =>
  typeof path === 'string' && (path === FILE || path.endsWith(`/${FILE}`) || path.endsWith(`\\${FILE}`))

const text = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}

const toThread = (value: unknown, index: number): Thread => {
  const raw = record(value)
  const status = STATUSES.find(one => one === raw.status) ?? 'open'
  const thread: Thread = {
    id: text(raw.id, `T${index + 1}`),
    name: text(raw.name, text(raw.id, `Thread ${index + 1}`)),
    status,
  }
  if (typeof raw.note === 'string') thread.note = raw.note
  if (typeof raw.link === 'string') thread.link = raw.link

  return thread
}

/** Reads an interview.json text leniently; undefined when it is not one. */
export const parseInterview = (source: string): Interview | undefined => {
  let json: unknown
  try {
    json = JSON.parse(source)
  } catch {
    return undefined
  }
  const raw = record(json)
  if (!Array.isArray(raw.threads) && typeof raw.goal !== 'string') return undefined

  const counts = record(raw.counts)
  const status = raw.status === 'paused' || raw.status === 'done' ? raw.status : 'active'
  const slug = text(raw.slug, 'interview')

  return {
    slug,
    title: text(raw.title, slug),
    goal: text(raw.goal),
    mode: text(raw.mode, 'understand'),
    outcome: text(raw.outcome),
    sufficiency: text(raw.sufficiency),
    status,
    session: Math.max(1, count(raw.session)),
    round: count(raw.round),
    threads: (Array.isArray(raw.threads) ? raw.threads : []).map(toThread),
    counts: {
      decisions: count(counts.decisions),
      open: count(counts.open),
      toVerify: count(counts.toVerify),
    },
    next: text(raw.next),
  }
}

/** Threads that count toward progress: everything not parked or spun off. */
export const progress = (interview: Interview): { done: number; total: number } => {
  const inScope = interview.threads.filter(t => t.status !== 'parked' && t.status !== 'spun-off')

  return { done: inScope.filter(t => t.status === 'enough').length, total: inScope.length }
}

const FILL: Record<ThreadStatus, number> = { open: 0, partial: 5, enough: 10, parked: 0, 'spun-off': 0 }

export const threadBar = (status: ThreadStatus): string => {
  if (status === 'parked') return '‖ parked   '
  if (status === 'spun-off') return '↗ spun off '

  return '█'.repeat(FILL[status]) + '░'.repeat(10 - FILL[status]) + ' '
}

export const ratioBar = (done: number, total: number, width = 10): string => {
  const filled = total === 0 ? 0 : Math.round((done / total) * width)

  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

export const summary = (interview: Interview): string => {
  const { done, total } = progress(interview)
  const { open, toVerify } = interview.counts

  return [
    `${done}/${total} threads`,
    `${interview.counts.decisions} decisions`,
    `${open} open`,
    ...(toVerify > 0 ? [`${toVerify} to verify`] : []),
  ].join(' · ')
}
