import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import {
  countLedger,
  folderOf,
  isInside,
  isInterviewFile,
  isLedgerFile,
  isTooBroad,
  parseInterview,
  progress,
  readDecisions,
  staleReasons,
} from '../hooks/interview'

const HOME = '/home/ana'
const ROOT = `${HOME}/.claude/interviews`
const PROJECT = '/work/shop'
const KEY = 'shop-6e3ccdf9'
const DIR = `${ROOT}/${KEY}/billing-retries`
const PATH = `${DIR}/interview.json`
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-10-11T12:00:00Z')

const INTERVIEW = {
  schema: 1,
  slug: 'billing-retries',
  title: 'Billing retry redesign',
  goal: 'Decide how failed charges are retried',
  mode: 'plan',
  outcome: 'Phased plan',
  sufficiency: 'Every phase has a testable exit criterion',
  status: 'active',
  project: { path: PROJECT, remote: 'github.com/ana/shop' },
  session: 2,
  round: 5,
  threads: [
    { id: 'T1', name: 'Retry policy', status: 'enough' },
    { id: 'T2', name: 'Idempotency', status: 'partial', note: 'key scope unclear' },
    { id: 'T3', name: 'Queue migration', status: 'spun-off', link: '../queue-migration' },
    { id: 'T4', name: 'Alerting', status: 'parked' },
    { id: 'T5', name: 'Rollout', status: 'open' },
  ],
  queue: [
    { id: 'Q2', thread: 'T2', text: 'Key per charge or per invoice?', asked: true },
    { id: 'Q3', thread: 'T5', text: 'Who flips the flag?' },
  ],
  next: 'Round 6: idempotency key scope',
}

const LEDGER = `# Interview: Billing retry redesign

## Decisions
- **D1** (T1, s1r2) Exponential backoff. *Why:* card network guidance.
- ~~**D2** (T1, s1r2) Max 3 attempts.~~ → superseded by D6
- **D6** (T1, s2r4) Max 5 attempts.

## To verify
- **F2**: check the queue docs.
- **F4**: check the card network rules.

## Open questions
- **Q2** (T2) Key per charge or per invoice?
- **Q3** (T5) Who flips the flag?
- ~~**Q1** (T1) Who owns retry config?~~ → D4
`

const BAND = {
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const paneProps = (title: string) =>
  ({
    title,
    isFocused: true,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  }) as const

const MAP = { component: 'Pane', requestId: 'interview-map', props: paneProps('Interview') } as const
const CLEANUP = { component: 'Pane', requestId: 'interview-cleanup', props: paneProps('Interview cleanup') } as const

type Disk = Record<string, { text: string; mtimeMs?: number }>

type Options = {
  stored?: Record<string, unknown>
  /** A path that resolves elsewhere, as a symbolic link does. */
  links?: Record<string, string>
  /** What the permission check answers beneath the plugin. */
  checked?: { decision: 'ask' | 'deny'; rule?: string; hook?: string }
  home?: string
}

/**
 * A session over an in-memory disk: `files` by absolute path, folders implied
 * by them. Tool calls only report success, except under /broken/.
 */
const session = (on: On, files: Disk, { stored = {}, links = {}, checked = { decision: 'ask' }, home = HOME }: Options = {}) => {
  mock.store(on, stored)
  const clock = mock.clock(on, { now: NOW })
  const panes = new Set<string>()
  const prompts: string[] = []
  const toasts: string[] = []

  const folders = () => {
    const all = new Set<string>()
    for (const path of Object.keys(files)) {
      const parts = path.split('/')
      for (let i = 2; i < parts.length; i += 1) all.add(parts.slice(0, i).join('/'))
    }

    return all
  }

  on('session.cwd', () => ({ value: PROJECT }))
  on('session.root', () => ({ value: PROJECT }))
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? home : undefined }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', (_$, e) => {
    panes.add(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...panes].map(id => ({ id, title: id })) as never }))
  on('ui.toast', (_$, e) => {
    toasts.push(String((e as { text?: unknown }).text ?? e))

    return { value: undefined }
  })
  on('prompt.fill', (_$, e) => {
    prompts.push(e.text)

    return { isFilled: true }
  })
  // The test engine runs on POSIX and reads `C:/…` as relative, putting the
  // working folder in front; a Windows host would not, and takes either
  // separator, so take the prefix back off and use `/` throughout.
  const real = (path: string) => path.replace(/\\/g, '/').replace(/^.*\/(?=[A-Za-z]:\/)/, '')

  on('fs.read', (_$, e) => {
    const file = files[real(e.path)]

    return file === undefined ? { deny: `ENOENT ${e.path}` } : { value: file.text }
  })
  on('fs.write', (_$, e) => {
    files[e.path] = { text: e.text, mtimeMs: NOW }

    return { value: undefined }
  })
  on('fs.exists', (_$, e) => ({ value: files[real(e.path)] !== undefined || folders().has(real(e.path)) }))
  on('fs.stat', (_$, e) => {
    const path = real(e.path)
    const isFile = files[path] !== undefined
    if (!isFile && !folders().has(path) && links[path] === undefined) return { deny: `ENOENT ${path}` }

    return {
      value: {
        kind: isFile ? 'file' : 'dir',
        size: 0,
        mtimeMs: files[path]?.mtimeMs ?? NOW,
        isLink: links[path] !== undefined,
        ...(e.resolve ? { realPath: links[path] ?? path } : {}),
      } as never,
    }
  })
  on('fs.list', (_$, e) => {
    const prefix = `${e.path}/`
    const names = new Map<string, 'file' | 'dir'>()
    for (const path of [...Object.keys(files), ...folders()]) {
      if (!path.startsWith(prefix)) continue
      const rest = path.slice(prefix.length)
      const name = rest.split('/')[0] ?? ''
      names.set(name, rest.includes('/') || folders().has(path) ? 'dir' : 'file')
    }

    return {
      value: [...names].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: NOW, isLink: false })) as never,
    }
  })
  on('tool.call', (_$, e) =>
    ({ result: {}, isError: String((e as { file_path?: unknown }).file_path).startsWith('/broken/') }) as never)
  on('tool.check', () => checked)
  // What the engine draws where the plugin passes: an empty band.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
  on('session.start', () => ({ cwd: PROJECT }) as never)

  return { panes, prompts, toasts, files, clock }
}

const START = { cwd: PROJECT, surface: 'terminal', isInteractive: true } as never
const json = (value: object) => JSON.stringify(value)

describe('interview.json and ledger.md', () => {
  test('counts progress over in-scope threads only', () => {
    const interview = parseInterview(json(INTERVIEW))
    expect(interview).toBeDefined()
    expect(progress(interview!)).toEqual({ done: 1, total: 3 })
  })

  test('rejects text that is not an interview', () => {
    expect(parseInterview('{ nope')).toBeUndefined()
    expect(parseInterview('{"name":"pkg"}')).toBeUndefined()
  })

  test('fills defaults for a sparse file', () => {
    const interview = parseInterview('{"goal":"g","threads":[{"name":"A","status":"weird"}]}')
    expect(interview?.threads[0]).toEqual({ id: 'T1', name: 'A', status: 'open' })
    expect(interview?.status).toBe('active')
    expect(interview?.commits).toBeUndefined()
  })

  test('reads the commit policy and promotion, dropping what is malformed', () => {
    const none = parseInterview('{"goal":"g","commits":{"policy":"none","branch":"x"}}')
    expect(none?.commits).toEqual({ policy: 'none' })
    expect(parseInterview('{"goal":"g","commits":{"policy":"sometimes"}}')?.commits).toBeUndefined()
    const promoted = parseInterview('{"goal":"g","promoted":{"target":"docs/x.md","state":"committed","ref":"abc"}}')
    expect(promoted?.promoted).toEqual({ target: 'docs/x.md', state: 'committed', ref: 'abc' })
    expect(parseInterview('{"goal":"g","promoted":{"target":"x","state":"maybe"}}')?.promoted).toBeUndefined()
  })

  test('counts live decisions, open questions and to-verify entries from the ledger', () => {
    expect(countLedger(LEDGER)).toEqual({ decisions: 2, open: 2, toVerify: 2 })
    expect(countLedger('')).toEqual({ decisions: 0, open: 0, toVerify: 0 })
  })

  test('reads decisions newest first, cut before Why, struck ones with their replacement', () => {
    expect(readDecisions(LEDGER)).toEqual([
      { id: 'D6', thread: 'T1', text: 'Max 5 attempts.' },
      { id: 'D2', thread: 'T1', text: 'Max 3 attempts.', replacedBy: 'D6' },
      { id: 'D1', thread: 'T1', text: 'Exponential backoff.' },
    ])
  })

  test('drops queue items with no text', () => {
    const parsed = parseInterview(JSON.stringify({ goal: 'g', queue: [{ id: 'Q1', text: 'Why?' }, { id: 'Q2' }, 'x'] }))
    expect(parsed?.queue).toEqual([{ id: 'Q1', text: 'Why?' }])
  })

  test('stale: finished after 7 days, idle after 90, missing project, snoozed never', () => {
    const base = parseInterview(json(INTERVIEW))!
    const done = { ...base, status: 'done' as const }
    expect(staleReasons(done, 6, NOW, false)).toEqual([])
    expect(staleReasons(done, 8, NOW, false)).toEqual(['finished 8d ago, not promoted'])
    expect(staleReasons(base, 60, NOW, false)).toEqual([])
    expect(staleReasons(base, 91, NOW, false)).toEqual(['idle 91d'])
    expect(staleReasons(base, 1, NOW, true)).toEqual(['project folder missing (relink?)'])
    const snoozed = { ...done, snoozedUntil: '2026-11-01' }
    expect(staleReasons(snoozed, 30, NOW, true)).toEqual([])
  })
})

describe('progress display', () => {
  test('nothing in the band before an interview exists', async ($, on) => {
    session(on, {})
    await $.session.start(START)
    const ui = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'toggle' })).toBeUndefined()
  })

  test('writing interview.json shows the band and the pane, counts from the ledger', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) }, [`${DIR}/ledger.md`]: { text: LEDGER } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })

    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'dynamic-interview', surface, ...BAND })
      expect(await band.find({ text: /1\/3 · Q2 Key per charge or per invoice\?/ })).toBeDefined()
      expect(await band.find({ text: /Next: Round 6/ })).toBeUndefined()
      await band.unmount()

      const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface, ...MAP })
      expect(await pane.find({ text: /1\/3 threads · 2 decisions · 2 open · 2 to verify/ })).toBeDefined()
      expect(await pane.find({ text: /Idempotency/ })).toBeDefined()
      expect(await pane.find({ text: /key scope unclear/ })).toBeDefined()
      expect(await pane.find({ text: /decided when the outcome is promoted/ })).toBeDefined()
      await pane.unmount()
    }
  })

  test('an Edit of the ledger refreshes the counts', async ($, on) => {
    const { files } = session(on, { [PATH]: { text: json(INTERVIEW) }, [`${DIR}/ledger.md`]: { text: '' } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Edit', file_path: PATH, old_string: 'a', new_string: 'a' })
    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...MAP })
    expect(await band.find({ text: /0 decisions/ })).toBeDefined()

    files[`${DIR}/ledger.md`] = { text: LEDGER }
    await $.tool.call({ tool: 'Edit', file_path: `${DIR}/ledger.md`, old_string: 'a', new_string: 'a' })
    expect(await band.find({ text: /2 decisions/ })).toBeDefined()
  })

  test('a broken edit keeps the last good state and says so', async ($, on) => {
    const { files } = session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })
    files[PATH] = { text: '{ "goal": "half' }
    await $.tool.call({ tool: 'Edit', file_path: PATH, old_string: 'a', new_string: 'b' })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /Q2 Key per charge/ })).toBeDefined()
    expect(await band.find({ text: /file unreadable/ })).toBeDefined()
  })

  test('reads and subagent writes leave the display alone', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Read', file_path: PATH })
    await $.tool.call({ tool: 'Write', file_path: PATH, content: '', agentId: 'agent-1' } as never)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })

  test('other files and failed writes are ignored', async ($, on) => {
    const broken = '/broken/interview.json'
    session(on, { [broken]: { text: json(INTERVIEW) }, '/work/shop/package.json': { text: '{}' } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: '/work/shop/package.json', content: '{}' })
    await $.tool.call({ tool: 'Write', file_path: broken, content: json(INTERVIEW) })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })

  test('a new session restores the last interview of the project', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { stored: { [`last:${PROJECT}`]: PATH } })
    await $.session.start(START)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /Q2 Key per charge/ })).toBeDefined()
  })

  test('a done interview leaves the band', async ($, on) => {
    const done = json({ ...INTERVIEW, status: 'done' })
    session(on, { [PATH]: { text: done } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: done })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })
  test('the pane shows the question now, the queue, and the settled decisions newest first', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) }, [`${DIR}/ledger.md`]: { text: LEDGER } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })

    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...MAP })
    expect(await pane.find({ text: /▶ Q2 \(T2\) Key per charge or per invoice\?/ })).toBeDefined()
    expect(await pane.find({ text: /· Q3 \(T5\) Who flips the flag\?/ })).toBeDefined()
    expect(await pane.find({ text: /D1 \(T1\) Exponential backoff\.$/ })).toBeDefined()
    expect(await pane.find({ text: /✕ D2 superseded by D6/ })).toBeDefined()
  })

  test('with no queue the band and the pane fall back to next', async ($, on) => {
    const bare = json({ ...INTERVIEW, queue: undefined })
    session(on, { [PATH]: { text: bare } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: bare })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /Round 6: idempotency key scope/ })).toBeDefined()
    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...MAP })
    expect(await pane.find({ text: /Nothing planned\./ })).toBeDefined()
    expect(await pane.find({ text: /No decisions yet\./ })).toBeDefined()
  })
})

describe('show and hide', () => {
  test('/interview-progress toggles, show/hide set it, a bad argument changes nothing', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })
    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })

    await $.command.run({ command: 'interview-progress', args: '' } as never)
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
    await $.command.run({ command: 'interview-progress', args: '' } as never)
    expect(await band.find({ key: 'toggle' })).toBeDefined()
    const bad = await $.command.run({ command: 'interview-progress', args: 'maybe' } as never)
    expect(bad).toEqual(expect.objectContaining({ text: expect.stringContaining('Usage') }))
    expect(await band.find({ key: 'toggle' })).toBeDefined()
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
    await $.command.run({ command: 'interview-progress', args: 'show' } as never)
    expect(await band.find({ key: 'toggle' })).toBeDefined()
  })

  test('hiding closes the map pane, and /interview-map toggles it', async ($, on) => {
    const { panes } = session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })

    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(panes.has('interview-map')).toBe(true)
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    expect(panes.has('interview-map')).toBe(false)
    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(panes.has('interview-map')).toBe(true)
    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(panes.has('interview-map')).toBe(false)
  })

  test('hidden stays hidden in a new session', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { stored: { [`last:${PROJECT}`]: PATH, isHidden: true } })
    await $.session.start(START)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })

  test('one band button expands and collapses the pane', async ($, on) => {
    const { panes } = session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })
    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })

    expect(await band.find({ text: /Expand/ })).toBeDefined()
    await band.press({ key: 'toggle' })
    expect(panes.has('interview-map')).toBe(true)
    expect(await band.find({ text: /Collapse/ })).toBeDefined()
    await band.press({ key: 'toggle' })
    expect(panes.has('interview-map')).toBe(false)
    expect(await band.find({ text: /Expand/ })).toBeDefined()
  })

  test('Hide removes the band until the map command', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: json(INTERVIEW) })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...MAP })
    await pane.press({ key: 'hide' })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()

    const ran = await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(ran).toEqual(expect.objectContaining({ text: expect.stringContaining('Billing retry redesign') }))
    expect(await band.find({ key: 'toggle' })).toBeDefined()
  })
})

describe('cleanup pane', () => {
  const OLD = NOW - 12 * DAY
  const disk = (): Disk => ({
    [`${PROJECT}/package.json`]: { text: '{}' },
    [PATH]: { text: json(INTERVIEW) },
    [`${ROOT}/${KEY}/onboarding/interview.json`]: {
      text: json({ ...INTERVIEW, slug: 'onboarding', title: 'Onboarding', status: 'done', promoted: { target: 'docs/plans/onboarding.md', state: 'pushed' } }),
      mtimeMs: OLD,
    },
    [`${ROOT}/api-1a2b3c4d/auth-spike/interview.json`]: {
      text: json({ ...INTERVIEW, slug: 'auth-spike', title: 'Auth spike', project: { path: '/gone/api' } }),
    },
    [`${ROOT}/api-1a2b3c4d/_notes/interview.json`]: { text: json(INTERVIEW) },
  })

  test('lists stale interviews first and all of them on the other tab', async ($, on) => {
    session(on, disk())
    await $.session.start(START)
    await $.command.run({ command: 'interview-cleanup', args: '' } as never)

    for (const surface of ['terminal', 'desktop'] as const) {
      const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface, ...CLEANUP })
      expect(await pane.find({ text: /Stale \(2\)/ })).toBeDefined()
      expect(await pane.find({ text: /onboarding.*finished 12d ago/ })).toBeDefined()
      expect(await pane.find({ text: /auth-spike.*project folder missing/ })).toBeDefined()
      expect(await pane.find({ key: `row:${DIR}` })).toBeUndefined()
      await pane.press({ key: 'tab:all' })
      expect(await pane.find({ key: `row:${DIR}` })).toBeDefined()
      expect(await pane.find({ text: /_notes/ })).toBeUndefined()
      await pane.press({ key: 'tab:stale' })
      await pane.unmount()
    }
  })

  test('Open, Archive and Delete hand the request to Claude through the prompt', async ($, on) => {
    const { prompts, panes } = session(on, disk())
    await $.session.start(START)
    await $.command.run({ command: 'interview-cleanup', args: '' } as never)
    const onboarding = `${ROOT}/${KEY}/onboarding`

    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...CLEANUP })
    await pane.press({ key: `row:${onboarding}` })
    await pane.press({ key: 'delete' })
    expect(prompts).toEqual([`Delete the dynamic interview at ${onboarding}`])
    expect(panes.has('interview-cleanup')).toBe(false)
    await pane.unmount()

    await $.command.run({ command: 'interview-cleanup', args: '' } as never)
    const again = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...CLEANUP })
    await again.press({ key: `row:${onboarding}` })
    await again.press({ key: 'archive' })
    expect(prompts[1]).toBe(`Archive the dynamic interview at ${onboarding}`)
  })

  test('Keep snoozes the interview for 30 days without touching other fields', async ($, on) => {
    const { files } = session(on, disk())
    await $.session.start(START)
    await $.command.run({ command: 'interview-cleanup', args: '' } as never)
    const onboarding = `${ROOT}/${KEY}/onboarding`

    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...CLEANUP })
    await pane.press({ key: `row:${onboarding}` })
    await pane.press({ key: 'keep' })

    const written = JSON.parse(files[`${onboarding}/interview.json`]!.text)
    expect(written.snoozedUntil).toBe('2026-11-10')
    expect(written.promoted).toEqual({ target: 'docs/plans/onboarding.md', state: 'pushed' })
    expect(await pane.find({ text: /Stale \(1\)/ })).toBeDefined()
  })

  test('three or more stale interviews raise one toast at session start', async ($, on) => {
    const files = disk()
    files[`${ROOT}/x/old/interview.json`] = { text: json({ ...INTERVIEW, slug: 'old' }), mtimeMs: NOW - 120 * DAY }
    const { toasts, clock } = session(on, files)
    await $.session.start(START)
    expect(toasts.some(text => text.includes('could be tidied up'))).toBe(false)
    await clock.advance(1)
    expect(toasts.filter(text => text.includes('3 interviews could be tidied up'))).toHaveLength(1)
  })
})

describe('writes without prompts', () => {
  test('a write inside the interviews folder is allowed, one outside is still asked', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)

    const inside = await $.tool.check({ tool: 'Write', input: { file_path: `${DIR}/ledger.md`, content: '' } } as never)
    expect(inside.decision).toBe('allow')
    const fresh = await $.tool.check({ tool: 'Write', input: { file_path: `${ROOT}/new-project/x/interview.json` } } as never)
    expect(fresh.decision).toBe('allow')
    const outside = await $.tool.check({ tool: 'Write', input: { file_path: `${PROJECT}/src/app.ts` } } as never)
    expect(outside.decision).toBe('ask')
    const climbing = await $.tool.check({ tool: 'Write', input: { file_path: `${ROOT}/../settings.json` } } as never)
    expect(climbing.decision).toBe('ask')
    const bash = await $.tool.check({ tool: 'Bash', input: { command: `rm -r ${DIR}` } } as never)
    expect(bash.decision).toBe('ask')
  })

  test('a link out of the interviews folder is not allowed', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { links: { [`${ROOT}/escape`]: '/etc' } })
    await $.session.start(START)

    const escaped = await $.tool.check({ tool: 'Write', input: { file_path: `${ROOT}/escape/passwd` } } as never)
    expect(escaped.decision).toBe('ask')
  })

  test('the auto_allow_writes option turns it off', { options: { auto_allow_writes: false } }, async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } })
    await $.session.start(START)

    const inside = await $.tool.check({ tool: 'Write', input: { file_path: `${DIR}/ledger.md` } } as never)
    expect(inside.decision).toBe('ask')
  })

  test('a deny from the person stands', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { checked: { decision: 'deny', reason: 'no' } as never })
    await $.session.start(START)

    const inside = await $.tool.check({ tool: 'Write', input: { file_path: `${DIR}/ledger.md` } } as never)
    expect(inside.decision).toBe('deny')
  })
})

describe('paths', () => {
  test('Windows separators are recognized and compared like POSIX ones', () => {
    expect(isInterviewFile('C:\\Users\\ana\\.claude\\interviews\\k\\s\\interview.json')).toBe(true)
    expect(isLedgerFile('C:\\Users\\ana\\.claude\\interviews\\k\\s\\ledger.md')).toBe(true)
    expect(folderOf('C:\\a\\b\\ledger.md')).toBe('C:/a/b')
    expect(isInside('c:/Users/ana/.claude/interviews/k/x.md', 'C:\\Users\\ana\\.claude\\interviews')).toBe(true)
    expect(isInside('/home/ana/.claude/interviews-old/x', '/home/ana/.claude/interviews')).toBe(false)
  })

  test('a root, home, ~/.claude or anything above them is too broad', () => {
    const guarded = ['/home/ana', '/home/ana/.claude']
    expect(isTooBroad('/', guarded)).toBe(true)
    expect(isTooBroad('C:/', guarded)).toBe(true)
    expect(isTooBroad('/home', guarded)).toBe(true)
    expect(isTooBroad('/home/ana', guarded)).toBe(true)
    expect(isTooBroad('/home/ana/.claude', guarded)).toBe(true)
    expect(isTooBroad('/home/ana/.claude/interviews', guarded)).toBe(false)
    expect(isTooBroad('/home/ana/notes/interviews', guarded)).toBe(false)
  })
})

describe('review fixes', () => {
  test('an ask from a settings rule or a hook is never turned into allow', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { checked: { decision: 'ask', rule: 'Write(~/.claude/**)' } })
    await $.session.start(START)
    const ruled = await $.tool.check({ tool: 'Write', input: { file_path: `${DIR}/ledger.md` } } as never)
    expect(ruled.decision).toBe('ask')
  })

  test('an ask from a PreToolUse hook stands too', async ($, on) => {
    session(on, { [PATH]: { text: json(INTERVIEW) } }, { checked: { decision: 'ask', hook: 'PreToolUse' } })
    await $.session.start(START)
    const hooked = await $.tool.check({ tool: 'Write', input: { file_path: `${DIR}/ledger.md` } } as never)
    expect(hooked.decision).toBe('ask')
  })

  for (const folder of ['~', '~/.claude', '/']) {
    test(`interviews_dir "${folder}" is too broad to auto-allow`, { options: { interviews_dir: folder } }, async ($, on) => {
      const { toasts, clock } = session(on, { [`${HOME}/.claude/settings.json`]: { text: '{}' }, [`${HOME}/.bashrc`]: { text: '' } })
      await $.session.start(START)
      for (const file of [`${HOME}/.claude/settings.json`, `${HOME}/.bashrc`, `${HOME}/.claude/interviews/k/s/ledger.md`]) {
        const verdict = await $.tool.check({ tool: 'Write', input: { file_path: file } } as never)
        expect(verdict.decision).toBe('ask')
      }
      await clock.advance(1)
      expect(toasts.some(text => text.includes('too broad'))).toBe(true)
    })
  }

  test('an interview.json written outside the interviews folder is ignored', async ($, on) => {
    const fixture = `${PROJECT}/test/fixtures/interview.json`
    session(on, { [fixture]: { text: json({ goal: 'fixture' }) } })
    await $.session.start(START)
    await $.tool.call({ tool: 'Write', file_path: fixture, content: json({ goal: 'fixture' }) })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })

  test('a remembered path outside the interviews folder is not restored', async ($, on) => {
    const fixture = `${PROJECT}/test/fixtures/interview.json`
    session(on, { [fixture]: { text: json(INTERVIEW) } }, { stored: { [`last:${PROJECT}`]: fixture } })
    await $.session.start(START)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'toggle' })).toBeUndefined()
  })

  test('no action is armed until an interview is picked, and Keep or a tab switch disarms it', async ($, on) => {
    const onboarding = `${ROOT}/${KEY}/onboarding`
    session(on, {
      [`${PROJECT}/package.json`]: { text: '{}' },
      [`${onboarding}/interview.json`]: {
        text: json({ ...INTERVIEW, slug: 'onboarding', status: 'done' }),
        mtimeMs: NOW - 12 * DAY,
      },
      [`${ROOT}/${KEY}/old/interview.json`]: { text: json({ ...INTERVIEW, slug: 'old' }), mtimeMs: NOW - 120 * DAY },
    })
    await $.session.start(START)
    await $.command.run({ command: 'interview-cleanup', args: '' } as never)

    const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...CLEANUP })
    expect(await pane.find({ key: 'delete' })).toBeUndefined()
    expect(await pane.find({ text: /Select an interview/ })).toBeDefined()

    await pane.press({ key: `row:${onboarding}` })
    expect(await pane.find({ key: 'delete' })).toBeDefined()
    await pane.press({ key: 'keep' })
    expect(await pane.find({ key: 'delete' })).toBeUndefined()

    await pane.press({ key: `row:${ROOT}/${KEY}/old` })
    await pane.press({ key: 'tab:all' })
    expect(await pane.find({ key: 'delete' })).toBeUndefined()
  })

  test('Windows paths: writes in the interviews folder are allowed and ledger edits refresh', async ($, on) => {
    const home = 'C:/Users/ana'
    const dir = `${home}/.claude/interviews/${KEY}/billing-retries`
    const { files } = session(
      on,
      { [`${dir}/interview.json`]: { text: json(INTERVIEW) }, [`${dir}/ledger.md`]: { text: '' } },
      { home: 'C:\\Users\\ana' },
    )
    await $.session.start(START)
    const winDir = dir.replace(/\//g, '\\')

    const verdict = await $.tool.check({ tool: 'Write', input: { file_path: `${winDir}\\ledger.md` } } as never)
    expect(verdict.decision).toBe('allow')

    await $.tool.call({ tool: 'Write', file_path: `${winDir}\\interview.json`, content: '' } as never)
    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...MAP })
    expect(await band.find({ text: /0 decisions/ })).toBeDefined()

    files[`${dir}/ledger.md`] = { text: LEDGER }
    await $.tool.call({ tool: 'Edit', file_path: `${winDir}\\ledger.md`, old_string: 'a', new_string: 'a' } as never)
    expect(await band.find({ text: /2 decisions/ })).toBeDefined()
  })
})
