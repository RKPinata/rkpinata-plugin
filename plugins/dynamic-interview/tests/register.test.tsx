import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { parseInterview, progress } from '../hooks/interview'

const CWD = '/proj'
const PATH = `${CWD}/.interviews/billing-retries/interview.json`

const INTERVIEW = {
  schema: 1,
  slug: 'billing-retries',
  title: 'Billing retry redesign',
  goal: 'Decide how failed charges are retried',
  mode: 'plan',
  outcome: 'Phased plan',
  sufficiency: 'Every phase has a testable exit criterion',
  status: 'active',
  session: 2,
  round: 5,
  threads: [
    { id: 'T1', name: 'Retry policy', status: 'enough' },
    { id: 'T2', name: 'Idempotency', status: 'partial', note: 'key scope unclear' },
    { id: 'T3', name: 'Queue migration', status: 'spun-off', link: '../queue-migration' },
    { id: 'T4', name: 'Alerting', status: 'parked' },
    { id: 'T5', name: 'Rollout', status: 'open' },
  ],
  counts: { decisions: 7, open: 3, toVerify: 2 },
  next: 'Round 6: idempotency key scope',
}

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

const PANE = {
  component: 'Pane',
  requestId: 'interview-map',
  props: {
    title: 'Interview',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

/** A session whose disk holds `files` and whose tools only report success. */
const session = (on: On, files: Record<string, string>, stored: Record<string, unknown> = {}) => {
  mock.store(on, stored)
  on('session.cwd', () => ({ value: CWD }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  const panes = new Set<string>()
  on('ui.open', (_$, e) => {
    panes.add(e.id)

    return { value: { isPlaced: true as const } }
  })
  on('ui.close', (_$, e) => {
    panes.delete(e.id)

    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [...panes].map(id => ({ id, title: id })) as never }))
  on('ui.toast', () => ({ value: undefined }))
  on('fs.read', (_$, e) => {
    const text = files[e.path]
    if (text === undefined) return { deny: `ENOENT ${e.path}` }

    return { value: text }
  })
  // What the engine draws where the plugin passes: an empty band.
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)

    return <Box key="engine" />
  })
  // A tool call on a path under /broken/ fails, as a refused or erroring write would.
  on('tool.call', (_$, e) =>
    ({ result: {}, isError: String((e as { file_path?: unknown }).file_path).startsWith('/broken/') }) as never)
  on('session.start', () => ({ cwd: CWD }) as never)

  return { panes }
}

describe('interview.json parsing', () => {
  test('counts progress over in-scope threads only', () => {
    const interview = parseInterview(JSON.stringify(INTERVIEW))
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
  })
})

describe('progress display', () => {
  test('nothing in the band before an interview exists', async ($, on) => {
    session(on, {})
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    const ui = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await ui.find({ key: 'map' })).toBeUndefined()
  })

  test('writing interview.json shows the band and the pane', async ($, on) => {
    session(on, { [PATH]: JSON.stringify(INTERVIEW) })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: JSON.stringify(INTERVIEW) })

    for (const surface of ['terminal', 'desktop'] as const) {
      const band = await $.ui.mount({ plugin: 'dynamic-interview', surface, ...BAND })
      expect(await band.find({ text: /billing-retries/ })).toBeDefined()
      expect(await band.find({ text: /1\/3 threads/ })).toBeDefined()
      expect(await band.find({ text: /Next: Round 6/ })).toBeDefined()
      await band.unmount()

      const pane = await $.ui.mount({ plugin: 'dynamic-interview', surface, ...PANE })
      expect(await pane.find({ text: /Idempotency/ })).toBeDefined()
      expect(await pane.find({ text: /key scope unclear/ })).toBeDefined()
      await pane.unmount()
    }
  })

  test('/interview-progress toggles, and show/hide set it', async ($, on) => {
    session(on, { [PATH]: JSON.stringify(INTERVIEW) })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Read', file_path: PATH })
    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })

    await $.command.run({ command: 'interview-progress', args: '' } as never)
    expect(await band.find({ key: 'map' })).toBeUndefined()
    await $.command.run({ command: 'interview-progress', args: '' } as never)
    expect(await band.find({ key: 'map' })).toBeDefined()
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    expect(await band.find({ key: 'map' })).toBeUndefined()
    await $.command.run({ command: 'interview-progress', args: 'show' } as never)
    expect(await band.find({ key: 'map' })).toBeDefined()
  })

  test('hiding closes the map pane, and /interview-map toggles it', async ($, on) => {
    const { panes } = session(on, { [PATH]: JSON.stringify(INTERVIEW) })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Read', file_path: PATH })
    const isOpen = async () => panes.has('interview-map')

    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(await isOpen()).toBe(true)
    await $.command.run({ command: 'interview-progress', args: 'hide' } as never)
    expect(await isOpen()).toBe(false)
    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(await isOpen()).toBe(true)
    await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(await isOpen()).toBe(false)
  })

  test('hidden stays hidden in a new session', async ($, on) => {
    session(on, { [PATH]: JSON.stringify(INTERVIEW) }, { [`last:${CWD}`]: PATH, isHidden: true })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'map' })).toBeUndefined()
  })

  test('Hide removes the band until the map command', async ($, on) => {
    session(on, { [PATH]: JSON.stringify(INTERVIEW) })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Read', file_path: PATH })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    await band.press({ key: 'hide' })
    expect(await band.find({ key: 'map' })).toBeUndefined()

    const ran = await $.command.run({ command: 'interview-map', args: '' } as never)
    expect(ran).toEqual(expect.objectContaining({ text: expect.stringContaining('Billing retry redesign') }))
    expect(await band.find({ key: 'map' })).toBeDefined()
  })

  test('other files and failed writes are ignored', async ($, on) => {
    const broken = '/broken/interview.json'
    session(on, { [PATH]: JSON.stringify(INTERVIEW), [broken]: JSON.stringify(INTERVIEW), '/proj/package.json': '{}' })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Read', file_path: '/proj/package.json' })
    await $.tool.call({ tool: 'Write', file_path: broken, content: JSON.stringify(INTERVIEW) })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'map' })).toBeUndefined()
  })

  test('a new session restores the last interview of the folder', async ($, on) => {
    session(on, { [PATH]: JSON.stringify(INTERVIEW) }, { [`last:${CWD}`]: PATH })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ text: /billing-retries/ })).toBeDefined()
  })

  test('a done interview leaves the band', async ($, on) => {
    const done = JSON.stringify({ ...INTERVIEW, status: 'done' })
    session(on, { [PATH]: done })
    await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true } as never)
    await $.tool.call({ tool: 'Write', file_path: PATH, content: done })

    const band = await $.ui.mount({ plugin: 'dynamic-interview', surface: 'terminal', ...BAND })
    expect(await band.find({ key: 'map' })).toBeUndefined()
  })
})
