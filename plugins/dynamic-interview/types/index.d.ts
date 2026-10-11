export type ThreadStatus = 'open' | 'partial' | 'enough' | 'parked' | 'spun-off'

export type Thread = {
  id: string
  name: string
  status: ThreadStatus
  note?: string
  link?: string
}

export type CommitPolicy = { policy: 'none' | 'local' | 'push'; branch?: string }

export type Interview = {
  slug: string
  title: string
  goal: string
  mode: string
  outcome: string
  sufficiency: string
  status: 'active' | 'paused' | 'done'
  /** Agreed once per goal; undefined until it is. */
  commits?: CommitPolicy
  session: number
  round: number
  threads: Thread[]
  counts: { decisions: number; open: number; toVerify: number }
  next: string
}

export type Loaded = { path: string; interview: Interview }

declare module 'claude-code' {
  interface PluginState {
    'dynamic-interview': { current: Loaded | null; isHidden: boolean }
  }
}
