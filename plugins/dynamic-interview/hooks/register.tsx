import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Loaded, ThreadStatus } from '../types'
import { isInterviewFile, parseInterview, progress, ratioBar, summary, threadBar } from './interview'

const PANE = 'interview-map'

const current = atom({ plugin: 'dynamic-interview', key: 'current' } as const, null)
const isBandHidden = atom({ plugin: 'dynamic-interview', key: 'isBandHidden' } as const, false)

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

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'interview-map',
      description: 'Show the current dynamic interview\'s thread map and progress in a pane',
    })
    const last = await $.store.get(await storeKey($))
    if (typeof last === 'string') await load($, last)

    return next(e)
  })

  on('command.run', { command: 'interview-map' }, async $ => {
    const loaded = await read($, current)
    if (loaded === null) {
      return { text: 'No interview yet. Start one with the dynamic-interview skill; the map appears once it writes interview.json.' }
    }
    await update($, isBandHidden, () => false)
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
      (await read($, isBandHidden))

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
          <Button key="hide" label="Hide" plain onPress={() => update($, isBandHidden, () => true)} />
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
