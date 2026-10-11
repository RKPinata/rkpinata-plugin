import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Loaded, ThreadStatus } from '../types'
import { describeCommits, isInterviewFile, parseInterview, progress, ratioBar, summary, threadBar } from './interview'

const PANE = 'interview-map'

const current = atom({ plugin: 'dynamic-interview', key: 'current' } as const, null)
const isHidden = atom({ plugin: 'dynamic-interview', key: 'isHidden' } as const, false)
const HIDDEN_KEY = 'isHidden'

const STATUS_COLOR: Record<ThreadStatus, string | undefined> = {
  enough: 'green',
  partial: 'yellow',
  open: undefined,
  parked: undefined,
  'spun-off': 'cyan',
}

const storeKey = async ($: EngineInterface) => `last:${await $.session.cwd()}`

/** Reads an interview.json and makes it the one on show; false when it is not one. */
const load = async ($: EngineInterface, path: string): Promise<boolean> => {
  const source = await $.fs.read(path).catch(() => undefined)
  const interview = typeof source === 'string' ? parseInterview(source) : undefined
  if (interview === undefined) return false

  const loaded: Loaded = { path, interview }
  await update($, current, () => loaded)
  await $.store.set(await storeKey($), path)

  return true
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: 'Interview' })
const isPaneOpen = async ($: EngineInterface) => (await $.ui.panes()).some(pane => pane.id === PANE)

/** Hides or shows all progress (band and pane), remembered across sessions. */
const setHidden = async ($: EngineInterface, hidden: boolean) => {
  await update($, isHidden, () => hidden)
  await $.store.set(HIDDEN_KEY, hidden)
  if (hidden) await $.ui.close({ id: PANE })
}

const HIDDEN_HINT = 'Interview progress hidden. /interview-progress shows it again.'

export const register: Register = on => {
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
    if ((await $.store.get(HIDDEN_KEY)) === true) await update($, isHidden, () => true)
    const last = await $.store.get(await storeKey($))
    if (typeof last === 'string') await load($, last)

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
    if (await isPaneOpen($)) {
      await $.ui.close({ id: PANE })

      return { text: 'Interview map closed.' }
    }
    await setHidden($, false)
    await openPane($)

    return { text: `Interview map opened for ${loaded.interview.title}.` }
  })

  // The skill keeps interview.json current; whenever Claude reads or writes one, show it.
  on('tool.call', async ($, e, next) => {
    const ran = await next(e)
    const tool = String(e.tool)
    const isFileTool = tool === 'Write' || tool === 'Edit' || tool === 'Read'
    const path = isFileTool ? (e as { file_path?: unknown }).file_path : undefined
    const hasFailed = ran.deny !== undefined || ran.isError === true

    if (isInterviewFile(path) && !hasFailed) {
      await load($, path).catch(() => false)
    }

    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const loaded = await read($, current)
    const isQuiet =
      e.props.hasSurvey ||
      loaded === null ||
      loaded.interview.status === 'done' ||
      (await read($, isHidden))

    if (isQuiet) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const { interview } = loaded
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
            <Text dimColor> {summary(interview)}</Text>
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

    const { interview, path } = loaded
    const { done, total } = progress(interview)
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
        <Text> </Text>
        {interview.goal !== '' && <Text>Goal: {interview.goal}</Text>}
        {interview.outcome !== '' && <Text>Outcome: {interview.outcome}</Text>}
        {interview.sufficiency !== '' && <Text dimColor>Enough when: {interview.sufficiency}</Text>}
        <Text dimColor>Saving: {describeCommits(interview.commits)}</Text>
        <Text> </Text>
        {interview.threads.length === 0 && <Text dimColor>No threads mapped yet.</Text>}
        {interview.threads.map(thread => (
          <Box>
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
          <Text color="green">{ratioBar(done, total)}</Text> {summary(interview)}
        </Text>
        {interview.next !== '' && <Text>Next: {interview.next}</Text>}
        <Text> </Text>
        <Text dimColor wrap="truncate-start">
          {path}
        </Text>
      </Box>
    )
  })
}
