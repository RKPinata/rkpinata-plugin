export type ThreadStatus = 'open' | 'partial' | 'enough' | 'parked' | 'spun-off'

export type Thread = {
  id: string
  name: string
  status: ThreadStatus
  note?: string
  link?: string
}

export type CommitPolicy = { policy: 'none' | 'local' | 'push'; branch?: string }

/** Where the outcome went at the exit gate, recorded step by step. */
export type Promotion = {
  target: string
  state: 'pending' | 'written' | 'committed' | 'pushed' | 'published'
  ref?: string
}

export type Interview = {
  slug: string
  title: string
  goal: string
  mode: string
  outcome: string
  sufficiency: string
  status: 'active' | 'paused' | 'done' | 'archived'
  /** Agreed when the outcome is promoted to the repo; undefined until then. */
  commits?: CommitPolicy
  promoted?: Promotion
  project?: { path?: string; remote?: string }
  /** ISO date; the cleanup pane leaves the interview alone until then. */
  snoozedUntil?: string
  session: number
  round: number
  threads: Thread[]
  next: string
}

/** Counted from ledger.md, so they never drift from it. */
export type LedgerCounts = { decisions: number; open: number; toVerify: number }

export type Loaded = {
  path: string
  interview: Interview
  counts: LedgerCounts
  /** Set when the file on disk no longer parses; the interview shown is the last good one. */
  problem?: string
}

/** One interview the cleanup pane lists. */
export type Entry = {
  dir: string
  title: string
  slug: string
  project: string
  status: Interview['status']
  progress: string
  idleDays: number
  reasons: string[]
}

export type CleanupTab = 'stale' | 'all'

declare module 'claude-code' {
  interface PluginState {
    'dynamic-interview': {
      current: Loaded | null
      isHidden: boolean
      entries: Entry[]
      tab: CleanupTab
      selected: string | null
    }
  }
}
