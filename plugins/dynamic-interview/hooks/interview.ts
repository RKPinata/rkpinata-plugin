import type { CommitPolicy, Decision, Interview, LedgerCounts, Promotion, QueueItem, Thread, ThreadStatus } from '../types'

const STATUSES: ThreadStatus[] = ['open', 'partial', 'enough', 'parked', 'spun-off']
const FILE = 'interview.json'
const LEDGER = 'ledger.md'
export const DAY = 24 * 60 * 60 * 1000

/** A path with `/` separators, so Windows and POSIX paths compare alike. */
export const toSlash = (path: string): string => path.replace(/\\/g, '/')

/** An absolute path: `/…` or a Windows drive `C:/…`. */
export const isAbsolute = (path: string): boolean => /^(\/|[A-Za-z]:\/)/.test(toSlash(path))

const endsWithFile = (path: unknown, name: string): path is string =>
  typeof path === 'string' && (path === name || toSlash(path).endsWith(`/${name}`))

export const isInterviewFile = (path: unknown): path is string => endsWithFile(path, FILE)
export const isLedgerFile = (path: unknown): path is string => endsWithFile(path, LEDGER)

/** The folder holding an interview.json or a ledger.md, with `/` separators. */
export const folderOf = (path: string): string => {
  const slashed = toSlash(path)

  return slashed.slice(0, slashed.lastIndexOf('/'))
}

/** `~` and `~/x` under `home`; anything else as given, without a trailing separator. */
export const expandHome = (path: string, home: string | undefined): string => {
  const expanded = home !== undefined && /^~([\\/]|$)/.test(path) ? home + path.slice(1) : path

  return expanded.length > 1 ? expanded.replace(/[\\/]+$/, '') : expanded
}

/** Drive letters compare without case, as Windows does. */
const comparable = (path: string): string => {
  const slashed = toSlash(path)

  return /^[A-Za-z]:\//.test(slashed) ? slashed.toLowerCase() : slashed
}

/** Whether `path` lies inside `root` (both already resolved), on either separator. */
export const isInside = (path: string, root: string): boolean => {
  const base = comparable(root)

  return comparable(path).startsWith(base.endsWith('/') ? base : `${base}/`)
}

/** Whether two resolved paths are the same place. */
export const isSamePath = (a: string, b: string): boolean =>
  comparable(a).replace(/\/+$/, '') === comparable(b).replace(/\/+$/, '')

/**
 * Whether a resolved interviews folder is too broad to auto-allow writes in:
 * a filesystem root, the home folder, ~/.claude, or a folder above one of them.
 */
export const isTooBroad = (root: string, guarded: readonly string[]): boolean =>
  /^(\/|[A-Za-z]:\/?)$/.test(toSlash(root)) ||
  guarded.some(path => isSamePath(path, root) || isInside(path, root))

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

const toQueueItem = (value: unknown, index: number): QueueItem[] => {
  const raw = record(value)
  if (typeof raw.text !== 'string' || raw.text === '') return []
  const item: QueueItem = { id: text(raw.id, `#${index + 1}`), text: raw.text }
  if (typeof raw.thread === 'string') item.thread = raw.thread
  if (raw.asked === true) item.asked = true

  return [item]
}

const toCommits = (value: unknown): CommitPolicy | undefined => {
  const raw = record(value)
  if (raw.policy !== 'none' && raw.policy !== 'local' && raw.policy !== 'push') return undefined

  return typeof raw.branch === 'string' && raw.policy !== 'none'
    ? { policy: raw.policy, branch: raw.branch }
    : { policy: raw.policy }
}

const PROMOTION_STATES: Promotion['state'][] = ['pending', 'written', 'committed', 'pushed', 'published']

const toPromotion = (value: unknown): Promotion | undefined => {
  const raw = record(value)
  const state = PROMOTION_STATES.find(one => one === raw.state)
  if (typeof raw.target !== 'string' || state === undefined) return undefined

  return typeof raw.ref === 'string' ? { target: raw.target, state, ref: raw.ref } : { target: raw.target, state }
}

/** How work is saved for this goal, in a few words. */
export const describeCommits = (commits: CommitPolicy | undefined): string => {
  if (commits === undefined) return 'decided when the outcome is promoted'
  if (commits.policy === 'none') return 'no commits (you save work)'
  const how = commits.policy === 'push' ? 'commit + push' : 'commit locally'

  return commits.branch === undefined ? how : `${how} on ${commits.branch}`
}

export const describePromotion = (promoted: Promotion | undefined): string | undefined =>
  promoted === undefined ? undefined : `${promoted.target} (${promoted.state})`

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

  const status =
    raw.status === 'paused' || raw.status === 'done' || raw.status === 'archived' ? raw.status : 'active'
  const slug = text(raw.slug, 'interview')
  const commits = toCommits(raw.commits)
  const promoted = toPromotion(raw.promoted)
  const project = record(raw.project)
  const interview: Interview = {
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
    queue: (Array.isArray(raw.queue) ? raw.queue : []).flatMap(toQueueItem),
    next: text(raw.next),
  }
  if (commits !== undefined) interview.commits = commits
  if (promoted !== undefined) interview.promoted = promoted
  if (typeof project.path === 'string' || typeof project.remote === 'string') {
    interview.project = {
      ...(typeof project.path === 'string' ? { path: project.path } : {}),
      ...(typeof project.remote === 'string' ? { remote: project.remote } : {}),
    }
  }
  if (typeof raw.snoozedUntil === 'string') interview.snoozedUntil = raw.snoozedUntil

  return interview
}

/**
 * Counts what ledger.md records, the way references/state-and-ledger.md
 * writes it: live `- **D1**` and `- **Q1**` entries (struck `- ~~` ones are
 * settled), and every entry under `## To verify`.
 */
export const countLedger = (ledger: string): LedgerCounts => {
  const counts: LedgerCounts = { decisions: 0, open: 0, toVerify: 0 }
  let section = ''
  for (const line of ledger.split(/\r?\n/)) {
    const heading = /^##\s+(.*)$/.exec(line)
    if (heading !== null) {
      section = (heading[1] ?? '').trim().toLowerCase()
      continue
    }
    if (/^- \*\*D\d+\*\*/.test(line)) counts.decisions += 1
    else if (/^- \*\*Q\d+\*\*/.test(line)) counts.open += 1
    if (section === 'to verify' && /^- \S/.test(line) && !line.startsWith('- ~~')) counts.toVerify += 1
  }

  return counts
}

const LIVE_DECISION = /^- \*\*(D\d+)\*\*\s*(?:\(([^)]*)\))?\s*(.*)$/
const STRUCK_DECISION = /^- ~~\*\*(D\d+)\*\*\s*(?:\(([^)]*)\))?\s*(.*?)~~\s*(?:→\s*(.*))?$/

/**
 * The decision lines of ledger.md, newest first, each cut to its statement:
 * the `*Why:*` and anything after it stay in the ledger.
 */
export const readDecisions = (ledger: string): Decision[] => {
  const found: Decision[] = []
  for (const line of ledger.split(/\r?\n/)) {
    const struck = STRUCK_DECISION.exec(line)
    const live = struck === null ? LIVE_DECISION.exec(line) : null
    const match = struck ?? live
    if (match === null) continue

    const thread = (match[2] ?? '').split(',')[0]?.trim()
    const decision: Decision = { id: match[1] ?? '', text: (match[3] ?? '').split(/\s*\*Why:\*/)[0]?.trim() ?? '' }
    if (thread !== undefined && thread !== '') decision.thread = thread
    if (struck !== null) decision.replacedBy = (struck[4] ?? '').replace(/^superseded by\s*/i, '').trim() || '?'
    found.push(decision)
  }

  return found.reverse()
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

export const summary = (interview: Interview, counts: LedgerCounts): string => {
  const { done, total } = progress(interview)

  return [
    `${done}/${total} threads`,
    `${counts.decisions} decisions`,
    `${counts.open} open`,
    ...(counts.toVerify > 0 ? [`${counts.toVerify} to verify`] : []),
  ].join(' · ')
}

export const STALE_AFTER_FINISHED_DAYS = 7
export const STALE_AFTER_IDLE_DAYS = 90
export const SNOOZE_DAYS = 30

/**
 * Why an interview is worth tidying, or nothing. Finished ones go stale a week
 * after their last write; any one after 90 idle days, so a paused plan is left
 * alone; and one whose project folder is gone, which wants relinking first.
 */
export const staleReasons = (
  interview: Interview,
  idleDays: number,
  now: number,
  isProjectMissing: boolean,
): string[] => {
  const snoozed = interview.snoozedUntil === undefined ? NaN : Date.parse(interview.snoozedUntil)
  if (!Number.isNaN(snoozed) && snoozed > now) return []

  const reasons: string[] = []
  if (interview.status === 'done' && idleDays >= STALE_AFTER_FINISHED_DAYS) {
    reasons.push(interview.promoted === undefined ? `finished ${idleDays}d ago, not promoted` : `finished ${idleDays}d ago`)
  } else if (idleDays >= STALE_AFTER_IDLE_DAYS) {
    reasons.push(`idle ${idleDays}d`)
  }
  if (isProjectMissing) reasons.push('project folder missing (relink?)')

  return reasons
}

export const daysBetween = (from: number, to: number): number => Math.max(0, Math.floor((to - from) / DAY))

/** The JSON text of an interview.json with `snoozedUntil` set, every other field kept as written. */
export const withSnooze = (source: string, until: string): string | undefined => {
  try {
    const raw: unknown = JSON.parse(source)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined

    return `${JSON.stringify({ ...raw, snoozedUntil: until }, null, 2)}\n`
  } catch {
    return undefined
  }
}
