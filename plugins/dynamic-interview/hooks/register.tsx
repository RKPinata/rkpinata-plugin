import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { CleanupTab, Entry, LedgerCounts, Loaded, ThreadStatus } from '../types'
import {
  DAY,
  SNOOZE_DAYS,
  countLedger,
  daysBetween,
  describeCommits,
  describePromotion,
  expandHome,
  folderOf,
  isAbsolute,
  isInside,
  isInterviewFile,
  isLedgerFile,
  isSamePath,
  isTooBroad,
  parseInterview,
  progress,
  ratioBar,
  staleReasons,
  summary,
  threadBar,
  toSlash,
  withSnooze,
} from './interview'

const PANE = 'interview-map'
const CLEANUP = 'interview-cleanup'
const HIDDEN_KEY = 'isHidden'
const DEFAULT_ROOT = '~/.claude/interviews'
const STALE_TOAST_AT = 3

const current = atom({ plugin: 'dynamic-interview', key: 'current' } as const, null)
const isHidden = atom({ plugin: 'dynamic-interview', key: 'isHidden' } as const, false)
const entries = atom({ plugin: 'dynamic-interview', key: 'entries' } as const, [])
const tab = atom({ plugin: 'dynamic-interview', key: 'tab' } as const, 'stale')
const selected = atom({ plugin: 'dynamic-interview', key: 'selected' } as const, null)

const STATUS_COLOR: Record<ThreadStatus, string | undefined> = {
  enough: 'green',
  partial: 'yellow',
  open: undefined,
  parked: undefined,
  'spun-off': 'cyan',
}

const HIDDEN_HINT = 'Interview progress hidden. /interview-progress shows it again.'
const NO_COUNTS: LedgerCounts = { decisions: 0, open: 0, toVerify: 0 }

const storeKey = async ($: EngineInterface) => `last:${await $.session.root()}`

const home = async ($: EngineInterface) => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))

/** Reads a file's text, or undefined when it can't be read. */
const readText = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  const source = await $.fs.read(path).catch(() => undefined)

  return typeof source === 'string' ? source : undefined
}

/**
 * Makes the interview.json at `path` the one on show. A file that no longer
 * parses keeps the last good state on screen, marked, rather than blanking it.
 */
const load = async ($: EngineInterface, path: string): Promise<void> => {
  const source = await readText($, path)
  const interview = source === undefined ? undefined : parseInterview(source)

  if (interview === undefined) {
    await update($, current, shown =>
      shown !== null && shown.path === path
        ? { ...shown, problem: 'interview.json does not parse; showing the last good state' }
        : shown,
    )

    return
  }

  const ledger = await readText($, `${folderOf(path)}/ledger.md`)
  const loaded: Loaded = { path, interview, counts: ledger === undefined ? NO_COUNTS : countLedger(ledger) }
  await update($, current, () => loaded)
  await $.store.set(await storeKey($), path)
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Interview' })
const isPaneOpen = async ($: EngineInterface, id: string) => (await $.ui.panes()).some(pane => pane.id === id)

/** Hides or shows all progress (band and pane), remembered across sessions. */
const setHidden = async ($: EngineInterface, hidden: boolean) => {
  await update($, isHidden, () => hidden)
  await $.store.set(HIDDEN_KEY, hidden)
  if (hidden) await $.ui.close({ id: PANE })
}

/**
 * Where a path lands once links are resolved, with `/` separators; for a file
 * not written yet, its nearest existing folder resolved plus the rest.
 * Undefined for a relative path or one that climbs with `..`.
 */
const placed = async ($: EngineInterface, path: string): Promise<string | undefined> => {
  const slashed = toSlash(path)
  if (!isAbsolute(slashed) || /(^|\/)\.\.(\/|$)/.test(slashed)) return undefined

  let head = slashed
  let tail = ''
  for (let depth = 0; depth < 64; depth += 1) {
    const stat = await $.fs.stat(head, { resolve: true }).catch(() => undefined)
    if (stat?.realPath !== undefined) return toSlash(stat.realPath) + tail
    const cut = head.lastIndexOf('/')
    if (cut <= 0) return undefined
    tail = head.slice(cut) + tail
    head = head.slice(0, cut)
  }

  return undefined
}

const interviewsRoot = async ($: EngineInterface, configured: string) => expandHome(configured, await home($))

type Root = { path: string | undefined; isSafe: boolean }

// The resolved interviews folder, worked out once per configured folder and home.
let rootCache: { key: string; root: Root } | undefined

/**
 * The interviews folder with links resolved, and whether it is narrow enough
 * to auto-allow writes in: never a filesystem root, the home folder,
 * ~/.claude, or a folder above one of them.
 */
const resolveRoot = async ($: EngineInterface, configured: string): Promise<Root> => {
  const homePath = await home($)
  const key = `${configured}\n${homePath ?? ''}`
  if (rootCache?.key === key) return rootCache.root

  const path = await placed($, expandHome(configured, homePath))
  const guarded = homePath === undefined
    ? []
    : (await Promise.all([placed($, homePath), placed($, `${homePath}/.claude`)])).filter(
        (one): one is string => one !== undefined,
      )
  const root: Root = { path, isSafe: path !== undefined && !isTooBroad(path, guarded) }
  rootCache = { key, root }

  return root
}

/** Whether a path lies inside the interviews folder, links resolved. */
const isInInterviews = async ($: EngineInterface, configured: string, path: string): Promise<boolean> => {
  const { path: root } = await resolveRoot($, configured)
  const target = await placed($, path)

  return root !== undefined && target !== undefined && isInside(target, root)
}

/** Reads one interview folder for the cleanup list; undefined when it holds no interview. */
const readEntry = async (
  $: EngineInterface,
  project: string,
  dir: string,
  now: number,
): Promise<Entry | undefined> => {
  const file = `${dir}/interview.json`
  const [source, stat] = await Promise.all([readText($, file), $.fs.stat(file).catch(() => undefined)])
  const interview = source === undefined ? undefined : parseInterview(source)
  if (interview === undefined) return undefined

  const idleDays = daysBetween(stat?.mtimeMs ?? now, now)
  const projectPath = interview.project?.path
  const isProjectMissing = projectPath !== undefined && !(await $.fs.exists(projectPath).catch(() => true))
  const { done, total } = progress(interview)

  return {
    dir,
    title: interview.title,
    slug: interview.slug,
    project,
    status: interview.status,
    progress: `${done}/${total}`,
    idleDays,
    reasons: staleReasons(interview, idleDays, now, isProjectMissing),
  }
}

/** Lists every interview under the interviews folder, stale ones first, reading them in parallel. */
const scan = async ($: EngineInterface, configured: string): Promise<Entry[]> => {
  const root = await interviewsRoot($, configured)
  const now = await $.clock.now()
  const isFolder = (entry: { name: string; kind: string }) =>
    entry.kind === 'dir' && !entry.name.startsWith('.') && !entry.name.startsWith('_')

  const projects = (await $.fs.list(root).catch(() => [])).filter(isFolder)
  const perProject = await Promise.all(
    projects.map(async project => {
      const slugs = (await $.fs.list(`${root}/${project.name}`).catch(() => [])).filter(isFolder)

      return Promise.all(slugs.map(slug => readEntry($, project.name, `${root}/${project.name}/${slug.name}`, now)))
    }),
  )
  const found = perProject.flat().filter((entry): entry is Entry => entry !== undefined)

  found.sort((a, b) => b.reasons.length - a.reasons.length || b.idleDays - a.idleDays)
  await update($, entries, () => found)
  // A list that changed under the selection must not leave an action aimed at a row nobody picked.
  await update($, selected, picked => (found.some(entry => entry.dir === picked) ? picked : null))

  return found
}

/** After the session is ready: says once if interviews pile up, or if auto-allow is off for a too-broad folder. */
const tidyNotice = async ($: EngineInterface, configured: string, isAutoAllowed: boolean) => {
  const stale = (await scan($, configured)).filter(entry => entry.reasons.length > 0)
  if (stale.length >= STALE_TOAST_AT) {
    $.ui.toast(`${stale.length} interviews could be tidied up: /interview-cleanup`)
  }
  if (isAutoAllowed && !(await resolveRoot($, configured)).isSafe) {
    $.ui.toast('dynamic-interview: the interviews folder is too broad, so its writes will still ask for permission.')
  }
}

const openCleanup = async ($: EngineInterface, configured: string) => {
  await scan($, configured)
  await $.ui.open({ id: CLEANUP, title: 'Interview cleanup', focus: true })
}

/** Puts a request in the prompt for the person to send; Claude does the work in view. */
const handOff = async ($: EngineInterface, text: string, verb: string) => {
  await $.ui.close({ id: CLEANUP })
  const filled = await $.prompt.fill({ text })
  $.ui.toast(filled.isFilled ? `Press Enter to ask Claude to ${verb} it.` : text)
}

const snooze = async ($: EngineInterface, configured: string, dir: string) => {
  const path = `${dir}/interview.json`
  const source = await readText($, path)
  const until = new Date((await $.clock.now()) + SNOOZE_DAYS * DAY).toISOString().slice(0, 10)
  const next = source === undefined ? undefined : withSnooze(source, until)
  if (next === undefined) {
    $.ui.toast(`Could not update ${path}.`)

    return
  }
  await $.fs.write(path, next)
  await scan($, configured)
  $.ui.toast(`Kept until ${until}.`)
}

export const register: Register = (on, options: PluginOptions) => {
  const configured = typeof options.interviews_dir === 'string' && options.interviews_dir !== ''
    ? options.interviews_dir
    : DEFAULT_ROOT
  const isAutoAllowed = options.auto_allow_writes !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'interview-progress',
      description: 'Show or hide the interview progress band and pane',
      argumentHint: '[show|hide]',
    })
    await $.command.register({
      name: 'interview-map',
      description: 'Open or close the interview thread map pane',
    })
    await $.command.register({
      name: 'interview-cleanup',
      description: 'Review finished, idle or orphaned interviews: open, archive, keep or delete',
    })
    if ((await $.store.get(HIDDEN_KEY)) === true) await update($, isHidden, () => true)
    const last = await $.store.get(await storeKey($))
    if (typeof last === 'string' && (await isInInterviews($, configured, last))) await load($, last)

    // Scanning every interview is not worth delaying the first prompt for.
    $.clock.after(1, () => {
      void tidyNotice($, configured, isAutoAllowed).catch(() => undefined)
    })

    return next(e)
  })

  on('command.run', { command: 'interview-progress' }, async ($, e) => {
    const asked = e.args.trim().toLowerCase()
    if (asked !== '' && asked !== 'show' && asked !== 'hide') {
      return { text: 'Usage: /interview-progress [show|hide]; with no argument it toggles.' }
    }
    const hidden = asked === '' ? !(await read($, isHidden)) : asked === 'hide'
    await setHidden($, hidden)

    return { text: hidden ? HIDDEN_HINT : 'Interview progress shown above the prompt; /interview-map opens the full map.' }
  })

  on('command.run', { command: 'interview-map' }, async $ => {
    const loaded = await read($, current)
    if (loaded === null) {
      return { text: 'No interview yet. Start one with the dynamic-interview skill; the map appears once it writes interview.json.' }
    }
    if (await isPaneOpen($, PANE)) {
      await $.ui.close({ id: PANE })

      return { text: 'Interview map closed.' }
    }
    await setHidden($, false)
    await openPane($)

    return { text: `Interview map opened for ${loaded.interview.title}.` }
  })

  on('command.run', { command: 'interview-cleanup' }, async $ => {
    await openCleanup($, configured)
    const all = await read($, entries)
    const stale = all.filter(entry => entry.reasons.length > 0).length

    return { text: `Interview cleanup opened: ${stale} of ${all.length} interviews could be tidied.` }
  })

  // The skill writes interview.json and ledger.md after every round; show what
  // the main loop writes inside the interviews folder. Reads (browsing
  // candidates), subagents' writes and same-named files elsewhere (a test
  // fixture) leave the display alone.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    const path = (tool === 'Write' || tool === 'Edit') && e.agentId === undefined
      ? (e as { file_path?: unknown }).file_path
      : undefined
    const hasFailed = ran.deny !== undefined || ran.isError === true
    const isOurs = !hasFailed && (isInterviewFile(path) || isLedgerFile(path)) && (await isInInterviews($, configured, path))

    if (isOurs && isInterviewFile(path)) {
      await load($, path).catch(() => undefined)
    } else if (isOurs && isLedgerFile(path)) {
      const shown = await read($, current)
      if (shown !== null && isSamePath(folderOf(shown.path), folderOf(path))) {
        await load($, shown.path).catch(() => undefined)
      }
    }

    return ran
  }).catch(($, e, next) => next(e))

  // Saving every round must not cost a permission prompt: a write inside the
  // interviews folder that would only be asked about by default is allowed.
  // Anything a rule, a hook or an organization ceiling decided stands, and
  // nothing is allowed when the folder is too broad (a root, home, ~/.claude).
  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    const isDefaultAsk =
      verdict.decision === 'ask' && verdict.rule === undefined && verdict.hook === undefined && verdict.ceiling !== 'ask'
    if (!isAutoAllowed || !isDefaultAsk || (e.tool !== 'Write' && e.tool !== 'Edit')) return verdict

    const file = (e.input as { file_path?: unknown } | null)?.file_path
    if (typeof file !== 'string' || !(await resolveRoot($, configured)).isSafe) return verdict
    if (!(await isInInterviews($, configured, file))) return verdict

    return { decision: 'allow', reason: 'dynamic-interview: a write inside the interviews folder' }
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const loaded = await read($, current)
    const isQuiet =
      e.props.hasSurvey ||
      loaded === null ||
      loaded.interview.status === 'done' ||
      loaded.interview.status === 'archived' ||
      (await read($, isHidden))

    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { interview, counts, problem } = loaded
    const { done, total } = progress(interview)

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box>
          <Text wrap="truncate-end">
            <Text bold>◆ {interview.slug}</Text>
            <Text dimColor>
              {' '}· {interview.mode} · s{interview.session} r{interview.round} ·{' '}
            </Text>
            <Text color="green">{ratioBar(done, total, 8)}</Text>
            <Text dimColor> {summary(interview, counts)}</Text>
            {problem !== undefined && <Text color="yellow"> · file unreadable</Text>}
          </Text>
        </Box>
        <Box>
          {interview.next !== '' && (
            <Box flexGrow={1}>
              <Text dimColor wrap="truncate-end">
                Next: {interview.next}
              </Text>
            </Box>
          )}
          <Button key="map" label="Map" plain onPress={() => openPane($)} />
          <Text> </Text>
          <Button
            key="hide"
            label="Hide"
            plain
            onPress={async () => {
              await setHidden($, true)
              $.ui.toast(HIDDEN_HINT)
            }}
          />
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const loaded = await read($, current)

    if (loaded === null) {
      return <Text dimColor>No interview yet. The map appears once the skill writes interview.json.</Text>
    }

    const { interview, path, counts, problem } = loaded
    const { done, total } = progress(interview)
    const promotion = describePromotion(interview.promoted)
    const nameWidth = Math.min(
      28,
      Math.max(8, ...interview.threads.map(t => t.id.length + 1 + t.name.length)),
    )

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Text bold wrap="truncate-end">
          {interview.title}
        </Text>
        <Text dimColor wrap="truncate-end">
          {interview.mode} · session {interview.session}, round {interview.round} · {interview.status}
        </Text>
        {problem !== undefined && <Text color="yellow">{problem}</Text>}
        <Text> </Text>
        {interview.goal !== '' && <Text>Goal: {interview.goal}</Text>}
        {interview.outcome !== '' && <Text>Outcome: {interview.outcome}</Text>}
        {interview.sufficiency !== '' && <Text dimColor>Enough when: {interview.sufficiency}</Text>}
        <Text dimColor>Saving: {describeCommits(interview.commits)}</Text>
        {promotion !== undefined && <Text dimColor>Promoted: {promotion}</Text>}
        <Text> </Text>
        {interview.threads.length === 0 && <Text dimColor>No threads mapped yet.</Text>}
        {interview.threads.map(thread => (
          <Box key={`thread:${thread.id}`}>
            <Box width={nameWidth + 2} flexShrink={0}>
              <Text wrap="truncate-end">
                <Text dimColor>{thread.id}</Text> {thread.name}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Text color={STATUS_COLOR[thread.status]} dimColor={thread.status === 'parked'}>
                {threadBar(thread.status)}
              </Text>
            </Box>
            <Text dimColor wrap="truncate-end">
              {thread.note ?? thread.link ?? (thread.status === 'spun-off' || thread.status === 'parked' ? '' : thread.status)}
            </Text>
          </Box>
        ))}
        <Text> </Text>
        <Text>
          <Text color="green">{ratioBar(done, total)}</Text> {summary(interview, counts)}
        </Text>
        {interview.next !== '' && <Text>Next: {interview.next}</Text>}
        <Text> </Text>
        <Text dimColor wrap="truncate-start">
          {path}
        </Text>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: CLEANUP }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const all = await read($, entries)
    const shownTab: CleanupTab = await read($, tab)
    const stale = all.filter(entry => entry.reasons.length > 0)
    const list = shownTab === 'stale' ? stale : all
    const picked = await read($, selected)
    const chosen = picked === null ? undefined : list.find(entry => entry.dir === picked)

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        <Box>
          <Button
            key="tab:stale"
            plain
            hotkey="s"
            onPress={async () => {
              await update($, tab, () => 'stale' as const)
              await update($, selected, () => null)
            }}
          >
            {shownTab === 'stale' ? '▸ ' : '  '}Stale ({stale.length})
          </Button>
          <Text>   </Text>
          <Button
            key="tab:all"
            plain
            hotkey="l"
            onPress={async () => {
              await update($, tab, () => 'all' as const)
              await update($, selected, () => null)
            }}
          >
            {shownTab === 'all' ? '▸ ' : '  '}All ({all.length})
          </Button>
        </Box>
        <Text> </Text>
        {list.length === 0 && (
          <Text dimColor>{shownTab === 'stale' ? 'Nothing to tidy.' : 'No interviews in this folder yet.'}</Text>
        )}
        {list.map(entry => (
          <Button key={`row:${entry.dir}`} plain onPress={() => update($, selected, () => entry.dir)}>
            {entry.dir === chosen?.dir ? '▸ ' : '  '}
            {entry.slug}
            <Text dimColor>
              {'  '}
              {entry.project} · {entry.status} · {entry.progress} threads ·{' '}
              {entry.reasons.length > 0 ? entry.reasons.join(', ') : `idle ${entry.idleDays}d`}
            </Text>
          </Button>
        ))}
        {chosen === undefined && list.length > 0 && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text dimColor>Select an interview to act on it.</Text>
          </Box>
        )}
        {chosen !== undefined && (
          <Box flexDirection="column">
            <Text> </Text>
            <Text bold wrap="truncate-end">
              {chosen.title}
            </Text>
            <Text dimColor wrap="truncate-start">
              {chosen.dir}
            </Text>
            <Text> </Text>
            <Box>
              <Button
                key="open"
                label="Open"
                hotkey="o"
                variant="primary"
                onPress={() => handOff($, `Resume the dynamic interview at ${chosen.dir}`, 'resume')}
              />
              <Text> </Text>
              <Button
                key="archive"
                label="Archive"
                hotkey="a"
                onPress={() => handOff($, `Archive the dynamic interview at ${chosen.dir}`, 'archive')}
              />
              <Text> </Text>
              <Button key="keep" label={`Keep ${SNOOZE_DAYS}d`} hotkey="k" onPress={() => snooze($, configured, chosen.dir)} />
              <Text> </Text>
              <Button
                key="delete"
                label="Delete"
                hotkey="d"
                onPress={() => handOff($, `Delete the dynamic interview at ${chosen.dir}`, 'delete')}
              />
            </Box>
          </Box>
        )}
        <Text> </Text>
        <Text dimColor>
          ↑↓/tab move · enter select · s/l switch list · esc close · archive and delete are done by Claude, in view
        </Text>
      </Box>
    )
  })
}
