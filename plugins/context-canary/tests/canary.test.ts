import { expect, mock, test, type TestBody } from 'claude-code/testing'
import type { On, PluginState, TurnCompleteInput, SessionCompactInput, PluginOptions } from 'claude-code'
import { configuration, excerpt, isAlive } from '../hooks/register.js'
import { translations } from '../hooks/i18n.js'
import { rasterCells, svgSource } from '../hooks/pixels.js'
import { PALETTE, SPRITES } from '../hooks/sprites.js'
import { CHECKPOINT, missingCheckpoints, pickCodes, placeCheckpoints } from '../hooks/checkpoints.js'

type Canary = PluginState['context-canary']['canary']
const BASE = { word: '🐤', language: 'en', autoCompact: true, cooldownMinutes: 30, size: 'normal' }
const check = (name: string, body: TestBody, options: PluginOptions = {}) => test(name, { options: { ...BASE, ...options } }, body)
const START = { surface: 'terminal', isInteractive: true, cwd: '/work' } as const
const BAND = { plugin: 'context-canary', component: 'AbovePrompt', viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 95, view: {}, scroll: { offset: 0, bodyRows: 10 } } } as const
const done = (answer: string, extra = {}): TurnCompleteInput => ({ turnId: answer, answer, durationMs: 1, isAborted: false, reason: 'answer', ...extra })
const cmd = (args = '', command = 'canary') => ({ command, args, origin: { kind: 'composer' } as const, presentation: { isFullscreen: false, columns: 100 } })
const clean = (): Canary => ({ alive: true, responses: 0, streak: 0, lastTurnId: null, death: null,
  lastAutoCompactAt: null, blocked: false, recovery: 'idle', detail: '' })

function setup(on: On, options: { now?: number; persisted?: Canary; compact?: 'skip'|'fail'; postCompact?: () => Promise<unknown>; annotation?: string;
  file?: string; confirm?: string; dismiss?: boolean; readFail?: boolean; writeFail?: boolean; changeDuringAsk?: boolean; compactDelay?: number } = {}) {
  const clock = mock.clock(on, { now: options.now ?? 0 })
  mock.env(on, { HOME: '/mock-user' })
  const toasts: string[] = [], commands: string[] = [], invalidations: number[] = [], writes: Canary[] = []
  const compacts: SessionCompactInput[] = [], asked: string[] = [], fileWrites: string[] = [], paths: string[] = []
  let file = options.file
  let state = options.persisted ?? clean(), version = 0
  let completed = false, calledDuringTurn = false
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', () => ({ sessionId: 'session' }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostCompact', () => ({}))
  on('turn.start', ($, e) => { completed = false; return { turnId: e.turnId } })
  on('turn.complete', ($, e) => { completed = true; return { text: options.annotation ?? e.answer, ...(e.usage ? { usage: e.usage } : {}) } })
  on('session.compact', async ($, e) => {
    compacts.push(e)
    calledDuringTurn ||= !completed
    if (options.compactDelay) await clock.sleep(options.compactDelay)
    if (options.compact === 'skip') return { skip: 'policy' }
    // A thrown event stub is skipped by the engine; with no core in the kit,
    // this makes the calling API reject. The mod must leave the canary dead.
    if (options.compact === 'fail') throw new Error('test compact failure')
    if (options.postCompact) await options.postCompact()
    return { messages: [{ role: 'user', text: 'Preserved instructions', toolUses: [] }] }
  })
  on('command.register', ($, e) => { commands.push(e.name); return { value: { command: e.name } } })
  on('command.run', () => ({ text: 'other command' }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['Other mod'] }))
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.invalidate', ($, e, next) => { invalidations.push(clock.now()); return next(e) })
  on('state.get', () => ({ value: { value: state, version } }))
  on('state.set', ($, e) => {
    if (e.ifVersion !== undefined && e.ifVersion !== version) return { value: { isSet: false, version } }
    state = e.value
    writes.push(state)
    return { value: { isSet: true, version: ++version } }
  })
  on('fs.exists', ($, e) => { paths.push(e.path); return { value: file !== undefined } })
  on('fs.read', ($, e) => { paths.push(e.path); return options.readFail ? { deny: 'EACCES' } : { value: file ?? '' } })
  on('fs.write', ($, e) => {
    paths.push(e.path)
    if (options.writeFail) return { deny: 'EACCES' }
    file = e.text; fileWrites.push(e.text); return { value: undefined }
  })
  on('tool.call', ($, e) => {
    if (e.tool !== 'AskUserQuestion') return { result: 'tool output without sentinel' }
    const question = e.questions[0]!.question
    asked.push(question)
    if (options.changeDuringAsk) file = 'concurrent edit'
    return options.dismiss ? { result: { answers: {} } }
      : { result: { answers: { [question]: options.confirm ?? 'Confirm' } } }
  })
  return { clock, toasts, commands, invalidations, writes, compacts, asked, fileWrites, paths,
    state: () => state, file: () => file, calledDuringTurn: () => calledDuringTurn,
    resetHostState: () => { state = clean(); version += 1 } }
}

function children(node: unknown): unknown[] {
  return node && typeof node === 'object' && 'children' in node && Array.isArray(node.children) ? node.children : []
}
const shown = (node: unknown): string => typeof node === 'string' ? node : children(node).map(shown).join('')
const rows = (node: unknown) => children(node).map(shown)
type Frame = 'idle' | 'blink' | 'chirp' | 'hop' | 'dead'
const cellsOf = (frame: Frame, size: 'tiny' | 'small' | 'normal' | 'large' = 'normal') => rasterCells(SPRITES[size].frames[frame], PALETTE).cells
async function frameOf(ui: { find: (q: object) => Promise<any> }) {
  const art = await ui.find({ key: 'canary-art' })
  return (['idle', 'blink', 'chirp', 'hop', 'dead'] as const).find((f) => cellsOf(f) === art?.props.cells)
}

test('manifest defaults work without options', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  expect((await $.command.run(cmd('status'))).text).toContain('Canary alive')
  await $.turn.complete(done('🐤 Ready'))
  expect(env.state().streak).toBe(1)
  // Defaults: English, small sprite, only the bird.
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'canary-art' }))?.props.cells).toBe(cellsOf('idle', 'small'))
  expect(await ui.find({ text: 'Canary alive' })).toBeUndefined()
  await ui.unmount()
  expect(configuration({})).toEqual({ word: '🐤', autoCompact: true, cooldownMinutes: 30, language: 'en', size: 'small', info: 'none', checkpoints: 0 })
})

test('Unicode matching, formatted prefixes, boundaries and bounded excerpts', () => {
  for (const answer of ['Cánário', '**CANARIO**: yes', '🐦✨ «cánario», yes', '\n > ## [Canario](url)', '¿canario?', '👨‍💻 “canario”'])
    expect(isAlive(answer, 'Canário')).toBe(true)
  for (const answer of ['', 'Hello canario', 'canarios', 'canario2', 'canario_algo', 'canarioá', 'canario界'])
    expect(isAlive(answer, 'canario')).toBe(false)
  expect(isAlive('✨ **🐤** ready')).toBe(true)
  expect(isAlive('🐤ready')).toBe(true)
  expect(isAlive('Hello 🐤')).toBe(false)
  expect(isAlive('[a+b]: ready', 'a+b')).toBe(true)
  expect(excerpt('  a\n\tb\x1b[31m red\x1b[0m  ')).toBe('a b red')
  expect(excerpt('🐤'.repeat(90))).toBe('🐤'.repeat(79) + '…')
  expect(configuration({ word: '\n', cooldownMinutes: -1 })).toMatchObject({ word: '🐤', cooldownMinutes: 0, language: 'en' })
  expect(configuration({ word: 'x\ny' }).word).toBe('🐤')
  expect(Object.keys(translations.en)).toEqual(Object.keys(translations.es))
})

check('death -> deferred compact preserving instructions -> one revival', async ($, on) => {
  const env = setup(on, { postCompact: () => $.classic.PostCompact({ trigger: 'manual', compact_summary: 'kept' }) })
  await $.session.start(START)
  await $.turn.start({ turnId: 'bad', text: 'work' })
  await $.turn.complete(done('No sentinel', { turnId: 'bad' }))
  expect(env.state()).toMatchObject({ alive: false, recovery: 'pending', responses: 1 })
  expect(env.toasts.length).toBe(1)
  expect(env.compacts.length).toBe(0)
  await env.clock.advance(100)
  expect(env.compacts.length).toBe(1)
  expect(env.compacts[0]?.instructions).toMatch(/Preserve ALL user instructions/)
  expect(env.compacts[0]?.instructions).toContain('🐤')
  expect(env.calledDuringTurn()).toBe(false)
  expect(env.state()).toMatchObject({ alive: true, recovery: 'recovered', lastAutoCompactAt: 100, lastTurnId: 'bad' })
  expect(env.toasts).toEqual([env.toasts[0], 'revived after compaction'])
  await $.turn.complete(done('No sentinel', { turnId: 'bad' }))
  expect(env.state().alive).toBe(true)
  expect(env.state().responses).toBe(1)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await frameOf(ui)).toBe('idle')
  await ui.unmount()
})

check('a new running turn postpones compact; aborted completion is not checked', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('missing'))
  await $.turn.start({ turnId: 'new', text: 'new task' })
  await env.clock.advance(500)
  expect(env.compacts.length).toBe(0)
  await $.turn.complete(done('aborted', { turnId: 'new', isAborted: true }))
  await env.clock.advance(100)
  expect(env.compacts.length).toBe(1)
  expect(env.calledDuringTurn()).toBe(false)
  expect(env.state().responses).toBe(1)
})

check('a second death within 30 min latches the lock; revival cannot bypass it', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('first death'))
  await env.clock.advance(100)
  await $.command.run(cmd('revive'))
  expect(env.state().lastAutoCompactAt).toBe(100)
  await env.clock.advance(29 * 60_000)
  await $.turn.complete(done('second death'))
  expect(env.state()).toMatchObject({ alive: false, blocked: true, recovery: 'blocked' })
  expect(env.toasts.at(-1)).toContain('this session cannot recover: start a new one')
  await $.classic.PostCompact({ trigger: 'manual', compact_summary: 'manual summary' })
  expect(env.state().alive).toBe(false)
  await env.clock.advance(31 * 60_000)
  await $.command.run(cmd('revive'))
  await $.turn.complete(done('third death'))
  await env.clock.advance(100)
  expect(env.compacts.length).toBe(1)
  await $.session.end({ reason: 'clear', sessionId: 's', resume: { id: 's' } })
  await $.classic.SessionStart({ source: 'clear' })
  expect(env.state()).toEqual(clean())
})

for (const minutes of [0, 1, 30]) check('cooldown boundary permits another compact at ' + minutes + ' min', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('one'))
  await env.clock.advance(100 + minutes * 60_000)
  await $.turn.complete(done('two'))
  await env.clock.advance(100)
  expect(env.compacts.length).toBe(2)
  expect(env.state().alive).toBe(true)
}, { cooldownMinutes: minutes })

for (const mode of ['skip', 'fail'] as const) check('compact ' + mode + ' stays dead without retries', async ($, on) => {
  const env = setup(on, { compact: mode })
  await $.session.start(START)
  await $.turn.complete(done('missing'))
  await env.clock.advance(100)
  expect(env.state()).toMatchObject({ alive: false, recovery: mode === 'skip' ? 'skipped' : 'failed', lastAutoCompactAt: null })
  expect(env.toasts.at(-1)).toContain('remains dead')
  await $.turn.complete(done('still missing'))
  await env.clock.advance(120_000)
  expect(env.compacts.length).toBe(1)
  expect(env.toasts.length).toBe(2)
})

check('notification-only freezes the first death; manual PostCompact revives', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('🐤 first'))
  await $.turn.complete(done('Missing\nreply'))
  await $.turn.complete(done('another missing'))
  await env.clock.advance(120_000)
  expect(env.compacts).toEqual([])
  expect(env.toasts.length).toBe(1)
  expect(env.state()).toMatchObject({ alive: false, streak: 1, responses: 2, recovery: 'notifyOnly', death: { preview: 'Missing reply' } })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await frameOf(ui)).toBe('dead')
  expect(await ui.find({ text: 'Died on reply 2, 2 min ago' })).toBeUndefined()
  await $.classic.PostCompact({ trigger: 'auto', compact_summary: 'external compaction' })
  expect(env.state()).toMatchObject({ alive: true, recovery: 'recovered', lastAutoCompactAt: null })
  await ui.unmount()
}, { autoCompact: false })

check('Spanish configuration, custom word, command aliases and setup text', async ($, on) => {
  const env = setup(on, { confirm: 'Confirmar' })
  await $.session.start(START)
  expect((await $.command.run(cmd('estado', 'canario'))).text).toContain('Canario vivo')
  await $.turn.complete(done('✨ **FÉNIX**: listo'))
  expect(env.state().streak).toBe(1)
  await $.turn.complete(done('Sin saludo'))
  await env.clock.advance(100)
  expect(env.toasts.at(-1)).toBe('revivido tras compactar')
  expect(env.compacts[0]?.instructions).toContain('TODAS las instrucciones')
  await $.turn.complete(done('Falta de nuevo'))
  expect(env.toasts.at(-1)).toContain('esta sesión no se recupera: empieza una nueva')
  expect((await $.command.run(cmd('configurar', 'canario'))).text).toContain('Regla guardada')
  expect(env.file()).toContain('"Fénix"')
  expect(env.asked[0]).toContain('¿Añadir')
}, { word: 'Fénix', language: 'es' })

check('setup asks before writing, is idempotent, remove only removes marked content', async ($, on) => {
  const env = setup(on, { file: '# Personal rules\nKeep this.\n' })
  await $.session.start(START)
  await $.command.run(cmd('setup'))
  expect(env.asked.length).toBe(1)
  expect(env.asked[0]).toContain('/mock-user/.claude/CLAUDE.md')
  expect(env.asked[0]).toContain('Begin every final answer')
  expect(env.fileWrites.length).toBe(1)
  expect(env.file()).toContain('<!-- context-canary:start -->')
  await $.command.run(cmd('init'))
  expect(env.asked.length).toBe(1)
  expect(env.fileWrites.length).toBe(1)
  await $.command.run(cmd('remove'))
  expect(env.file()).toBe('# Personal rules\nKeep this.\n\n')
  expect(env.asked.length).toBe(2)
  expect((await $.command.run(cmd('remove'))).text).toContain('No managed canary block')
  expect(env.fileWrites.length).toBe(2)
  expect(env.paths.every(p => p === '/mock-user/.claude/CLAUDE.md')).toBe(true)
})

check('setup creates a missing file with consent and updates an old marked rule', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.command.run(cmd('setup'))
  expect(env.fileWrites.length).toBe(1)
  expect(env.file()).toContain('"🐤"')
})

check('setup replaces an existing rule preserving surrounding text and CRLF', async ($, on) => {
  const env = setup(on, { file: 'Before\r\n<!-- context-canary:start -->\r\nOld rule\r\n<!-- context-canary:end -->\r\nAfter\r\n' })
  await $.session.start(START)
  await $.command.run(cmd('setup'))
  expect(env.file()?.startsWith('Before\r\n<!-- context-canary:start -->\r\n')).toBe(true)
  expect(env.file()?.endsWith('<!-- context-canary:end -->\r\nAfter\r\n')).toBe(true)
  expect(env.file()).not.toContain('Old rule')
  await $.command.run(cmd('setup'))
  expect(env.fileWrites.length).toBe(1)
})

for (const options of [{ confirm: 'Cancel' }, { confirm: 'free text' }, { dismiss: true }, { changeDuringAsk: true },
  { file: 'existing', readFail: true }, { file: 'existing', writeFail: true },
  { file: '<!-- context-canary:start -->' },
  { file: '<!-- context-canary:start --><!-- context-canary:start --><!-- context-canary:end -->' }]) {
  check('setup never overwrites on refusal/error/conflict ' + JSON.stringify(options), async ($, on) => {
    const env = setup(on, options)
    await $.session.start(START)
    await $.command.run(cmd('setup'))
    expect(env.fileWrites).toEqual([])
  })
}

check('status is read-only; bare command reports previous status and revives', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('dead'))
  const count = env.writes.length
  expect((await $.command.run(cmd('status'))).text).toContain('Canary dead')
  expect(env.writes.length).toBe(count)
  expect((await $.command.run(cmd())).text).toContain('Canary dead')
  expect(env.state()).toMatchObject({ alive: true, responses: 0, streak: 0 })
  await env.clock.advance(100)
  expect(env.compacts).toEqual([])
  expect(env.fileWrites).toEqual([])
})

check('subagents, aborted/non-answer/empty turns and local commands do not count', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  for (const extra of [{ agentId: 'child' }, { isAborted: true }, { reason: 'error' }, { reason: 'refusal' }])
    await $.turn.complete(done('missing', extra))
  await $.turn.complete(done(' \n '))
  await $.classic.PostCompact({ trigger: 'auto', compact_summary: 'subagent', agent_id: 'child' })
  await $.classic.SessionStart({ source: 'clear', agent_id: 'child' })
  await $.command.run(cmd('status'))
  await $.command.run(cmd('', 'other'))
  expect(env.writes).toEqual([])
  expect(env.toasts).toEqual([])
  expect(env.compacts).toEqual([])
  await $.turn.complete(done('🐤 genuine'))
  expect(env.state().streak).toBe(1)
})

check('non-interactive sessions never write, ask, compact, toast, animate or draw', async ($, on) => {
  const env = setup(on)
  await $.session.start({ ...START, surface: null, isInteractive: false })
  await $.turn.complete(done('missing'))
  for (const action of ['', 'setup', 'remove', 'revive', 'status']) expect(await $.command.run(cmd(action))).toEqual({})
  await $.classic.SessionStart({ source: 'clear' })
  await $.classic.PostCompact({ trigger: 'auto', compact_summary: 'ignored' })
  await env.clock.advance(120_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'canary' })).toBeUndefined()
  expect(env.writes).toEqual([]); expect(env.toasts).toEqual([]); expect(env.compacts).toEqual([])
  expect(env.asked).toEqual([]); expect(env.paths).toEqual([]); expect(env.invalidations).toEqual([])
  await ui.unmount()
})

check('keeps other mods annotations, usage and duplicate protection', async ($, on) => {
  const env = setup(on, { annotation: 'Other annotation' })
  await $.session.start(START)
  await $.turn.complete(done('🐤 once'))
  await $.turn.complete(done('🐤 once'))
  expect(env.state().responses).toBe(1)
  const usage = { model: 'test', input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }
  const result = await $.turn.complete(done('missing', { usage }))
  expect(result.text).toMatch(/^Other annotation\nThe canary died/)
  expect(result.usage).toEqual(usage)
})

check('terminal draws pixel art with half blocks, Desktop an SVG, and the animation stays at 1 Hz', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  expect(env.commands).toEqual(['canary', 'canario'])
  const terminal = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await terminal.find({ text: 'Other mod' })).toBeDefined()
  expect((await terminal.find({ key: 'canary' }))?.props.height).toBe(SPRITES.normal.height / 2)
  // One column of air from the left edge.
  expect((await terminal.find({ key: 'canary' }))?.props.paddingLeft).toBe(1)
  const art = await terminal.find({ key: 'canary-art' })
  expect(art?.type).toBe('Raster')
  expect(art?.props).toMatchObject({ columns: SPRITES.normal.width, rows: SPRITES.normal.height / 2, cells: cellsOf('idle') })
  // Only the canary: no text beside the cage unless info asks for it.
  expect(await terminal.find({ text: 'Canary alive' })).toBeUndefined()
  expect(await terminal.find({ text: /Streak/ })).toBeUndefined()
  await terminal.unmount()
  const desktop = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await desktop.find({ type: 'Svg' })
  expect(svg?.props.source).toBe(svgSource(SPRITES.normal.frames.idle, PALETTE, 4))
  expect(svg?.props.alt).toBe('🐤 Canary alive')
  await desktop.unmount()
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const seen: (Frame | undefined)[] = []
  for (let i = 0; i < 6; i++) { await env.clock.advance(1000); seen.push(await frameOf(ui)) }
  expect(seen).toEqual(['idle', 'blink', 'idle', 'chirp', 'hop', 'idle'])
  expect(env.invalidations).toEqual([2000, 3000, 4000, 5000, 6000])
  await $.session.end({ reason: 'other', sessionId: 's', resume: { id: 's' } })
  await env.clock.advance(60000)
  expect(env.invalidations).toEqual([2000, 3000, 4000, 5000, 6000])
  await ui.unmount()
})

check('a dead canary is the grey dead frame and does not animate', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('No sentinel'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await frameOf(ui)).toBe('dead')
  const before = env.invalidations.length
  await env.clock.advance(10_000)
  expect(env.invalidations.length).toBe(before)
  expect(await frameOf(ui)).toBe('dead')
  await ui.unmount()
}, { autoCompact: false })

check('large size draws the 8-row sprite and needs the room for it', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'canary-art' }))?.props).toMatchObject({ rows: SPRITES.large.height / 2, cells: cellsOf('idle', 'large') })
  await ui.unmount()
  const tight = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, maxRows: SPRITES.large.height / 2 - 1 } })
  expect(await tight.find({ key: 'canary-art' })).toBeUndefined()
  expect((await tight.find({ key: 'canary' }))?.props.height).toBe(1)
  await tight.unmount()
}, { size: 'large' })

check('small size draws a 4-row hand-drawn sprite', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(SPRITES.small.height / 2).toBe(4)
  expect((await ui.find({ key: 'canary-art' }))?.props).toMatchObject({ rows: 4, columns: SPRITES.small.width, cells: cellsOf('idle', 'small') })
  await ui.unmount()
  await $.turn.complete(done('No sentinel'))
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'canary-art' }))?.props.cells).toBe(cellsOf('dead', 'small'))
  await ui.unmount()
}, { size: 'small', autoCompact: false })

check('tiny size draws a 3-row hand-drawn sprite', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(SPRITES.tiny.height / 2).toBe(3)
  expect((await ui.find({ key: 'canary-art' }))?.props).toMatchObject({ rows: 3, columns: SPRITES.tiny.width, cells: cellsOf('idle', 'tiny') })
  await ui.unmount()
  await $.turn.complete(done('No sentinel'))
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'canary-art' }))?.props.cells).toBe(cellsOf('dead', 'tiny'))
  await ui.unmount()
}, { size: 'tiny', autoCompact: false })

check('info: status shows only alive/dead beside the cage', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('🐤 first'))
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: 'Canary alive' })).toBeDefined()
  expect(await ui.find({ text: /Streak/ })).toBeUndefined()
  await ui.unmount()
  await $.turn.complete(done('Missing'))
  await env.clock.advance(120_000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: 'Canary dead' })).toBeDefined()
  expect(await ui.find({ text: /Died on reply/ })).toBeUndefined()
  await ui.unmount()
}, { info: 'status', autoCompact: false })

check('info: details puts streak and death details beside the cage, never taller than it', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('🐤 first'))
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: 'Canary alive' })).toBeDefined()
  expect(await ui.find({ text: 'Streak: 1 · "🐤"' })).toBeDefined()
  await ui.unmount()
  await $.turn.complete(done('Missing'))
  await env.clock.advance(120_000)
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: 'Died on reply 2, 2 min ago' })).toBeDefined()
  await ui.unmount()
}, { info: 'details', autoCompact: false })

check('info: details on tiny keeps at most three lines beside the cage', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('Missing'))
  await env.clock.advance(120_000)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ text: 'Canary dead' })).toBeDefined()
  expect(await ui.find({ text: /^Starts:/ })).toBeUndefined()
  await ui.unmount()
}, { info: 'details', size: 'tiny', autoCompact: false })

check('an unknown info value falls back to only the bird', async ($, on) => {
  setup(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'canary-art' })).toBeDefined()
  expect(await ui.find({ text: 'Canary alive' })).toBeUndefined()
  await ui.unmount()
}, { info: 'everything' })

check('narrow viewport or few rows gives a one-line status on both surfaces', async ($, on) => {
  setup(on)
  await $.session.start(START)
  for (const surface of ['terminal', 'desktop'] as const) for (const size of [{ columns: 18, rows: 30 }, { columns: 100, rows: 3 }]) {
    const ui = await $.ui.mount({ ...BAND, surface, viewport: size })
    expect((await ui.find({ key: 'canary' }))?.props.height).toBe(1)
    expect(await ui.find({ text: 'Canary alive' })).toBeDefined()
    expect(await ui.find({ key: 'canary-cage' })).toBeUndefined()
    expect(await ui.find({ text: 'Other mod' })).toBeDefined()
    await ui.unmount()
  }
  for (const props of [{ ...BAND.props, view: { agentId: 'child' } }, { ...BAND.props, hasSurvey: true }, { ...BAND.props, maxRows: 0 }]) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props })
    expect(await ui.find({ key: 'canary' })).toBeUndefined()
    await ui.unmount()
  }
})

check('reload retains cooldown, death and history without replaying recovery', async ($, on) => {
  const persisted: Canary = { ...clean(), alive: false, responses: 3, streak: 2, lastAutoCompactAt: 100, recovery: 'pending',
    death: { response: 3, at: 200, preview: 'old death', turnId: 'old' } }
  const env = setup(on, { persisted })
  await $.session.start(START)
  await $.session.start(START)
  expect(env.state()).toMatchObject({ alive: false, responses: 3, lastAutoCompactAt: 100, recovery: 'interrupted', death: persisted.death })
  await env.clock.advance(100)
  expect(env.compacts).toEqual([])
  expect(env.toasts).toEqual([])
})

check('/clear cancels queued recovery', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('missing'))
  await $.classic.SessionStart({ source: 'clear' })
  await env.clock.advance(100)
  expect(env.compacts).toEqual([])
  expect(env.state()).toEqual(clean())
})

for (const action of ['clear', 'end'] as const) check('an in-flight compact result cannot revive after ' + action, async ($, on) => {
  const env = setup(on, { postCompact: async () => {
    if (action === 'clear') await $.classic.SessionStart({ source: 'clear' })
    else await $.session.end({ reason: 'other', sessionId: 's', resume: { id: 's' } })
  } })
  await $.session.start(START)
  await $.turn.complete(done('missing'))
  await env.clock.advance(100)
  expect(env.compacts.length).toBe(1)
  expect(env.toasts.length).toBe(1)
  expect(env.state().lastAutoCompactAt).toBe(null)
  expect(env.state().alive).toBe(action === 'clear')
})

check('manual revive waits for an in-flight compact and preserves its cooldown', async ($, on) => {
  const env = setup(on, { postCompact: async () => {
    expect((await $.command.run(cmd('revive'))).text).toContain('Compacting')
  } })
  await $.session.start(START)
  await $.turn.complete(done('missing'))
  await env.clock.advance(100)
  expect(env.state()).toMatchObject({ alive: true, lastAutoCompactAt: 100 })
})

check('legacy state migration keeps the original death and streak', async ($, on) => {
  const legacy = { alive: false, responses: 4, streak: 3, lastTurnId: 'old',
    death: { response: 4, at: 0, preview: 'original', turnId: 'old' } } as Canary
  const env = setup(on, { persisted: legacy })
  await $.session.start(START)
  expect(env.state()).toMatchObject({ ...legacy, lastAutoCompactAt: null, recovery: 'idle', blocked: false })
  expect(env.toasts).toEqual([])
})

check('repeated session.start preserves healthy state and leaves only one animation timer', async ($, on) => {
  const env = setup(on, { persisted: { ...clean(), responses: 7, streak: 7, lastAutoCompactAt: 0 } })
  await $.session.start(START)
  await $.session.start(START)
  await env.clock.advance(6000)
  expect(env.state()).toMatchObject({ responses: 7, streak: 7, lastAutoCompactAt: 0 })
  expect(env.invalidations).toEqual([2000, 3000, 4000, 5000, 6000])
})

check('bodyColumns and maxRows also select the compact layout', async ($, on) => {
  setup(on)
  await $.session.start(START)
  for (const props of [{ ...BAND.props, bodyColumns: 19 }, { ...BAND.props, maxRows: 1 }]) {
    const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props })
    expect((await ui.find({ key: 'canary' }))?.props.height).toBe(1)
    await ui.unmount()
  }
})

check('intermediate tool steps cannot kill the canary', async ($, on) => {
  const env = setup(on)
  on('turn.step', async function* ($, e) {
    yield { kind: 'text', index: 0, text: 'Checking files' }
    return { turnId: e.turnId, index: e.index, answer: 'Checking files', toolUses: [], stopReason: 'end_turn', usage: null }
  })
  await $.session.start(START)
  const stream = $.turn.step({ turnId: 'tools', index: 0, model: 'test', messageCount: 1 })
  let chunk = await stream.next()
  while (!chunk.done) chunk = await stream.next()
  await $.tool.call({ tool: 'Read', file_path: '/work/file' })
  expect(env.writes).toEqual([])
  await $.turn.complete(done('🐤 Finished', { turnId: 'tools' }))
  expect(env.state().streak).toBe(1)
})

for (const source of ['resume', 'fork'] as const) check(source + ' keeps the interactive mode after the host resets state', async ($, on) => {
  const env = setup(on)
  await $.session.start(START)
  await $.turn.complete(done('old death'))
  await $.session.end({ reason: 'resume', sessionId: 'old', resume: { id: 'old' } })
  // The real host resets $.state when changing conversations, before SessionStart.
  env.resetHostState()
  await $.classic.SessionStart({ source })
  await env.clock.advance(100)
  expect(env.compacts).toEqual([])
  expect((await $.command.run(cmd('status'))).text).toContain('Canary alive')
  await $.turn.complete(done('🐤 new conversation'))
  expect(env.state().streak).toBe(1)
})

test('checkpoints are spread before headings at even fractions and replaced on a second run', () => {
  const file = ['# Me', 'a', 'b', '## Style', 'c', 'd', '## Testing', 'e', 'f', '## Git', 'g', 'h'].join('\n')
  const { text, checkpoints } = placeCheckpoints(file, ['maple', 'river', 'comet'])
  expect(checkpoints.map((c) => [c.n, c.code, c.heading])).toEqual([[1, 'maple', 'Style'], [2, 'river', 'Testing'], [3, 'comet', 'Git']])
  const lines = text.split('\n')
  expect(lines[lines.indexOf('## Testing') - 2]).toBe('> context-canary checkpoint 2/3: river')
  // Running again with other words leaves exactly one set.
  const again = placeCheckpoints(text, ['amber', 'olive'])
  expect(again.text.split('\n').filter((l) => CHECKPOINT.test(l))).toEqual(['> context-canary checkpoint 1/2: amber', '> context-canary checkpoint 2/2: olive'])
  expect(placeCheckpoints(again.text, []).text).toBe(file)
})

test('a file without headings still gets its checkpoints, and codes never repeat', () => {
  const { checkpoints, text } = placeCheckpoints('one\ntwo\nthree\nfour', ['iris', 'fern'])
  expect(checkpoints.length).toBe(2)
  expect(text.split('\n').filter((l) => CHECKPOINT.test(l)).length).toBe(2)
  const codes = pickCodes(5)
  expect(new Set(codes).size).toBe(5)
})

test('missingCheckpoints reads only the first line and whole words', () => {
  const cps = [{ n: 1, code: 'maple', heading: 'Style' }, { n: 2, code: 'river', heading: 'Testing' }]
  expect(missingCheckpoints('🐤 maple river\nDone.', cps)).toEqual([])
  expect(missingCheckpoints('**🐤 Maple, River** done', cps)).toEqual([])
  expect(missingCheckpoints('🐤 maple\nriver later', cps).map((c) => c.n)).toEqual([2])
  expect(missingCheckpoints('🐤 maplewood riverside', cps).map((c) => c.n)).toEqual([1, 2])
})

check('setup with checkpoints spreads them, puts the rule last, and the canary dies naming the lost part', async ($, on) => {
  const env = setup(on, { file: '# Me\nI like tea.\n## Style\nShort.\n## Testing\nAlways test.\n## Git\nSmall commits.\n' })
  const saved: unknown[] = []
  on('store.get', () => ({ value: undefined }))
  on('store.set', ($, e) => { saved.push(e.value); return { value: undefined } })
  await $.session.start(START)
  expect((await $.command.run(cmd('setup'))).text).toMatch(/saved/)
  const file = env.file()!
  const lines = file.split('\n')
  expect(lines.filter((l) => CHECKPOINT.test(l)).length).toBe(3)
  // The rule is the last thing in the file and never lists the code words.
  expect(file.trimEnd().endsWith('<!-- context-canary:end -->')).toBe(true)
  const codes = lines.map((l) => CHECKPOINT.exec(l)?.[3]).filter(Boolean) as string[]
  const rule = file.slice(file.indexOf('<!-- context-canary:start -->'))
  for (const c of codes) expect(rule.includes(c)).toBe(false)
  expect(env.asked[0]).toMatch(/3 checkpoints will be spread/)
  expect(saved.at(-1)).toHaveLength(3)
  // A second setup with the same count changes nothing.
  expect((await $.command.run(cmd('setup'))).text).toMatch(/already present/)
  // All words: alive. One missing: dead, naming the checkpoint and its section.
  await $.turn.complete(done(`🐤 ${codes.join(' ')}\nDone.`))
  expect(env.state().alive).toBe(true)
  const r = await $.turn.complete(done(`🐤 ${codes[0]} ${codes[2]}\nDone.`))
  expect(env.state()).toMatchObject({ alive: false, death: { lost: [{ n: 2 }] } })
  expect(r.text).toMatch(/missing checkpoint 2 \(before "/)
  // remove takes the rule and every checkpoint out.
  expect((await $.command.run(cmd('remove'))).text).toMatch(/removed/)
  expect(env.file()!.split('\n').some((l) => CHECKPOINT.test(l) || l.includes('context-canary:'))).toBe(false)
}, { checkpoints: 3, autoCompact: false })
