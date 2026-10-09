import { atom, read, update } from 'claude-code'
import { translate } from './i18n.js'
import { rasterCells, svgSource } from './pixels.js'
import { PALETTE, SPRITES } from './sprites.js'
import { CHECKPOINT, missingCheckpoints, pickCodes, placeCheckpoints, readCheckpoints } from './checkpoints.js'

/** @typedef {import('claude-code').PluginState['context-canary']['canary']} Canary */
/** @typedef {{ word: string, autoCompact: boolean, cooldownMinutes: number, language: 'en'|'es', size: 'tiny'|'small'|'normal'|'large', info: 'none'|'status'|'details', checkpoints: number, target: 'global'|'project' }} Config */
/** @typedef {import('./checkpoints.js').Checkpoint} Checkpoint */
/** @typedef {{ at: number, project: string, response: number, preview: string, turnId: string, lost?: { n: number, heading: string }[], outcome: string }} Death */
/** @typedef {{ checkpoints: Checkpoint[], cwd: string, interactive: boolean, activeTurn: string|null, timer: import('claude-code').Timer|null, recoveryTimer: import('claude-code').Timer|null, epoch: number, inFlight: boolean, beat: number, pose: string }} Runtime */

/** @returns {Canary} */
const fresh = () => ({ alive: true, responses: 0, streak: 0, lastTurnId: null, death: null,
  lastAutoCompactAt: null, blocked: false, recovery: 'idle', detail: '' })
const canary = atom({ plugin: 'context-canary', key: 'canary' }, fresh())
const BEGIN = '<!-- context-canary:start -->'
const END = '<!-- context-canary:end -->'
const LOG_SIZE = 30
/** How each death ended, for /canary log; anything else (still dead, skipped, failed) reads as dead. */
const OUTCOMES = /** @type {const} */ ({ recovered: 'outcomeRecovered', revived: 'outcomeRevived', blocked: 'outcomeBlocked' })

/** @param {import('claude-code').PluginOptions} options @returns {Config} */
export function configuration(options = {}) {
  const word = typeof options.word === 'string' ? options.word.trim() : ''
  return {
    word: word && Array.from(word).length <= 64 && !/[\p{C}\r\n]/u.test(word) ? word : '🐤',
    autoCompact: options.autoCompact !== false,
    cooldownMinutes: typeof options.cooldownMinutes === 'number' && Number.isFinite(options.cooldownMinutes)
      ? Math.max(0, Math.min(10080, options.cooldownMinutes)) : 30,
    language: options.language === 'es' ? 'es' : 'en',
    size: typeof options.size === 'string' && ['tiny', 'small', 'normal', 'large'].includes(options.size) ? /** @type {Config['size']} */ (options.size) : 'small',
    info: options.info === 'status' || options.info === 'details' ? options.info : 'none',
    checkpoints: typeof options.checkpoints === 'number' && Number.isFinite(options.checkpoints)
      ? Math.max(0, Math.min(5, Math.round(options.checkpoints))) : 0,
    target: options.target === 'project' ? 'project' : 'global',
  }
}

/** @param {string} text */
const normalize = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Skip formatting, quotes, emoji and punctuation, but never skip a word.
// Compare before skipping: an emoji sentinel must not disappear with the prefix.
/** @param {string} answer @param {string} [word] */
export function isAlive(answer, word = '🐤') {
  const text = normalize(answer)
  const sentinel = normalize(word)
  if (!sentinel) return false
  for (let index = 0; index < text.length;) {
    if (text.startsWith(sentinel, index)) {
      const rest = text.slice(index + sentinel.length)
      if (!/[\p{L}\p{N}_]$/u.test(sentinel) || !/^[\p{L}\p{N}_]/u.test(rest)) return true
      return false
    }
    const char = String.fromCodePoint(text.codePointAt(index) ?? 0)
    if (/[\p{L}\p{N}]/u.test(char) || !/[\s\p{P}\p{S}\u200d]/u.test(char)) return false
    index += char.length
  }
  return false
}

/** @param {string} answer */
export function excerpt(answer) {
  const text = answer.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  return chars.length > 80 ? chars.slice(0, 79).join('') + '…' : text
}

/** @param {Config} config @param {keyof typeof import('./i18n.js').translations.en} key @param {Record<string, string|number>} [values] */
const t = (config, key, values = {}) => translate(config.language, key, { word: JSON.stringify(config.word), ...values })

/** @param {Config} config @param {Canary} state */
function note(config, state) {
  return state.recovery === 'idle' ? '' : t(config, state.recovery, { reason: state.detail })
}

/** @param {Config} config @param {{ n: number, heading: string, where?: 'project' }} c */
const checkpointItem = (config, c) => t(config, 'checkpointItem', { n: c.n, heading: c.heading || t(config, 'noHeading') }) +
  (c.where === 'project' ? t(config, 'inProject') : '')

/** @param {Config} config @param {{ n: number, heading: string, where?: 'project' }[]} lost */
function lostList(config, lost) {
  return lost.map((c) => checkpointItem(config, c)).join(', ')
}

/** @param {Config} config @param {Canary} state */
function status(config, state) {
  return t(config, 'status', { health: t(config, state.alive ? 'alive' : 'dead'),
    streak: state.streak, responses: state.responses }) + (note(config, state) ? '\n' + note(config, state) : '')
}

/** @param {Runtime} runtime */
function stopClock(runtime) {
  runtime.timer?.cancel()
  runtime.timer = null
}

/** @param {Runtime} runtime */
function cancelRecovery(runtime) {
  runtime.recoveryTimer?.cancel()
  runtime.recoveryTimer = null
  runtime.epoch += 1
}

/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime @param {boolean} alive */
function startClock($, runtime, alive) {
  stopClock(runtime)
  runtime.beat = 0
  runtime.pose = 'idle'
  if (!runtime.interactive) return
  if (!alive) {
    runtime.timer = $.clock.every(60_000, () => $.ui.invalidate('ui.render'))
    return
  }
  runtime.timer = $.clock.every(1000, () => {
    runtime.beat = (runtime.beat + 1) % 8
    const nextPose = runtime.beat === 2 ? 'blink' : runtime.beat === 4 ? 'chirp' : runtime.beat === 5 ? 'hop' : 'idle'
    if (runtime.pose !== nextPose) {
      runtime.pose = nextPose
      $.ui.invalidate('ui.render')
    }
  })
}

/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime @param {Config} config @param {boolean} automatic */
async function recovered($, runtime, config, automatic) {
  const at = await $.clock.now()
  let changed = false
  await update($, canary, /** @returns {Canary} */ (state) => {
    changed = !state.alive && !state.blocked
    return changed ? { ...state, alive: true, streak: 0, death: null, recovery: 'recovered', detail: '',
      lastAutoCompactAt: automatic ? at : state.lastAutoCompactAt } : state
  })
  if (!changed) return
  cancelRecovery(runtime)
  startClock($, runtime, true)
  await logOutcome($, 'recovered')
  $.ui.toast(t(config, 'recovered'), { timeoutMs: 8000 })
}

// Never await compaction in turn.complete: that dispatch is still part of the
// running turn. A timer yields to the host; a newly started turn postpones it.
/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime @param {Config} config */
function scheduleRecovery($, runtime, config) {
  const epoch = runtime.epoch
  runtime.recoveryTimer = $.clock.after(100, async () => {
    runtime.recoveryTimer = null
    if (!runtime.interactive || runtime.epoch !== epoch) return
    const state = await read($, canary)
    if (state.alive || state.blocked || state.recovery !== 'pending') return
    if (runtime.activeTurn !== null || runtime.inFlight) {
      scheduleRecovery($, runtime, config)
      return
    }
    runtime.inFlight = true
    try {
      await update($, canary, /** @returns {Canary} */ (s) => ({ ...s, recovery: 'compacting' }))
      const result = await $.session.compact({ instructions: t(config, 'instructions', { rule: t(config, 'rule') }) })
      if (runtime.epoch !== epoch || !runtime.interactive) return
      if (result.skip !== undefined) {
        const detail = excerpt(result.skip)
        await update($, canary, /** @returns {Canary} */ (s) => ({ ...s, recovery: 'skipped', detail }))
        await logOutcome($, 'skipped')
        $.ui.toast(t(config, 'skipped', { reason: detail }), { timeoutMs: 8000 })
      } else {
        await recovered($, runtime, config, true)
      }
    } catch (error) {
      if (runtime.epoch !== epoch || !runtime.interactive) return
      const detail = excerpt(String(error))
      await update($, canary, /** @returns {Canary} */ (s) => ({ ...s, recovery: 'failed', detail }))
      await logOutcome($, 'failed')
      $.ui.toast(t(config, 'failed', { reason: detail }), { timeoutMs: 8000 })
    } finally {
      runtime.inFlight = false
    }
  })
}

/** @param {string} text */
function blockRange(text) {
  const start = text.indexOf(BEGIN)
  const end = text.indexOf(END)
  if (start === -1 && end === -1) return null
  if (start === -1 || end < start || text.indexOf(BEGIN, start + BEGIN.length) !== -1 ||
      text.indexOf(END, end + END.length) !== -1) return false
  return { start, end: end + END.length }
}

/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime */
async function projectRoot($, runtime) {
  try { return (await $.session.root()) || runtime.cwd } catch { return runtime.cwd }
}

/** @param {string} path */
const basename = (path) => path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path

/**
 * The instruction files the canary reads: the global one, and the project's own CLAUDE.md.
 * @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime
 * @returns {Promise<{ global: string|null, project: string|null }>}
 */
async function instructionPaths($, runtime) {
  const homeDirectory = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE'))
  const absolute = (/** @type {string|undefined} */ path) => !!path && /^(\/|[a-z]:[\\/])/i.test(path)
  const root = await projectRoot($, runtime)
  return {
    global: homeDirectory && absolute(homeDirectory) ? homeDirectory.replace(/[\\/]$/, '') + '/.claude/CLAUDE.md' : null,
    project: absolute(root) ? root.replace(/[\\/]$/, '') + '/CLAUDE.md' : null,
  }
}

// Checkpoints come from the files themselves, so a session in any project checks the words Claude was given.
/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime */
async function loadCheckpoints($, runtime) {
  /** @type {Checkpoint[]} */
  const all = []
  try {
    const paths = await instructionPaths($, runtime)
    const seen = new Set()
    for (const [where, path] of /** @type {const} */ ([['global', paths.global], ['project', paths.project]])) {
      if (!path || seen.has(path)) continue
      seen.add(path)
      if (!(await $.fs.exists(path))) continue
      for (const c of readCheckpoints(await $.fs.read(path))) {
        if (!all.some((x) => x.code === c.code)) all.push(where === 'project' ? { ...c, where } : c)
      }
    }
  } catch {}
  runtime.checkpoints = all
}

/** @param {import('claude-code').EngineInterface} $ @returns {Promise<Death[]>} */
async function readLog($) {
  try {
    const log = await $.store.get('deaths')
    return Array.isArray(log) ? log : []
  } catch { return [] }
}

/** @param {import('claude-code').EngineInterface} $ @param {(log: Death[]) => Death[]} change */
async function writeLog($, change) {
  try { await $.store.set('deaths', change(await readLog($)).slice(-LOG_SIZE)) } catch {}
}

/** Record how the latest death ended. @param {import('claude-code').EngineInterface} $ @param {string} outcome */
const logOutcome = ($, outcome) => writeLog($, (log) => {
  const last = log[log.length - 1]
  return last ? [...log.slice(0, -1), { ...last, outcome }] : log
})

/** @param {Config} config @param {number} ms */
function ago(config, ms) {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return t(config, 'agoMinutes', { n: minutes })
  if (minutes < 48 * 60) return t(config, 'agoHours', { n: Math.floor(minutes / 60) })
  return t(config, 'agoDays', { n: Math.floor(minutes / 1440) })
}

/** @param {import('claude-code').EngineInterface} $ @param {Config} config */
async function deathLog($, config) {
  const log = await readLog($)
  if (!log.length) return t(config, 'logEmpty')
  const now = await $.clock.now()
  const count = (/** @type {string} */ outcome) => log.filter((d) => d.outcome === outcome).length
  const lines = log.slice(-10).reverse().map((d) => t(config, 'logLine', { ago: ago(config, now - d.at), project: d.project,
    response: d.response, outcome: t(config, OUTCOMES[/** @type {keyof typeof OUTCOMES} */ (d.outcome)] ?? 'outcomeDead') }) +
    (d.lost?.length ? '\n  ' + t(config, 'logLost', { list: lostList(config, d.lost) }) : '') +
    '\n  ' + t(config, 'preview', { preview: d.preview }))
  return t(config, 'logSummary', { total: log.length, recovered: count('recovered'), revived: count('revived'), blocked: count('blocked') }) +
    '\n\n' + lines.join('\n')
}

/** @param {import('claude-code').EngineInterface} $ @param {Runtime} runtime @param {Config} config @param {boolean} remove */
async function instructionFile($, runtime, config, remove) {
  try {
    const path = (await instructionPaths($, runtime))[config.target]
    if (!path) return { text: t(config, config.target === 'project' ? 'noProject' : 'noHome') }
    const previous = await $.fs.exists(path) ? await $.fs.read(path) : ''
    const range = blockRange(previous)
    if (range === false) return { text: t(config, 'malformed') }
    const hasCheckpoints = previous.split(/\r?\n/).some((line) => CHECKPOINT.test(line))
    if (remove && !range && !hasCheckpoints) return { text: t(config, 'absent') }
    const newline = previous.includes('\r\n') ? '\r\n' : '\n'
    /** @type {Checkpoint[]} */
    let checkpoints = []
    let rule = t(config, 'rule')
    let updated
    if (!remove && config.checkpoints > 0) {
      // Keep the words already in the file when the count is the same, so a second setup changes nothing.
      const existing = previous.split(/\r?\n/).map((line) => CHECKPOINT.exec(line)?.[3]).filter(Boolean)
      const codes = existing.length === config.checkpoints ? /** @type {string[]} */ (existing) : pickCodes(config.checkpoints)
      const withoutBlock = range ? previous.slice(0, range.start) + previous.slice(range.end) : previous
      const placed = placeCheckpoints(withoutBlock.replace(/(\r?\n)+$/, ''), codes, newline)
      checkpoints = placed.checkpoints
      // The rule never lists the words: if only its own line survived, the answer could not contain them.
      rule = t(config, 'ruleCheckpoints', { count: codes.length })
      // The rule goes last, so the end of the file is sampled too.
      updated = placed.text + newline + newline + BEGIN + newline + rule + newline + END + newline
    } else {
      const block = BEGIN + newline + rule + newline + END
      const replacement = remove ? '' : block
      const base = hasCheckpoints ? placeCheckpoints(previous, [], newline).text : previous
      const baseRange = blockRange(base)
      updated = baseRange ? base.slice(0, baseRange.start) + replacement + base.slice(baseRange.end)
        : base + (base && !base.endsWith('\n') ? newline : '') + block + newline
    }
    if (updated === previous || (!remove && !range && !hasCheckpoints && previous.includes(rule))) return { text: t(config, 'exists') }
    const plan = checkpoints.map((c) => checkpointItem(config, c)).join('\n')
    let answer
    try {
      answer = await $.ui.ask(t(config, remove ? 'removeQuestion' : 'setupQuestion', { path, rule }) +
        (plan ? '\n\n' + t(config, 'setupCheckpoints', { count: checkpoints.length }) + '\n' + plan : ''),
        [t(config, 'yes'), t(config, 'no')])
    } catch {
      return { text: t(config, 'cancelled') }
    }
    if (answer !== t(config, 'yes')) return { text: t(config, 'cancelled') }
    // Re-read after the dialog so another editor's changes are not overwritten.
    const current = await $.fs.exists(path) ? await $.fs.read(path) : ''
    if (current !== previous) return { text: t(config, 'changed') }
    await $.fs.write(path, updated)
    await loadCheckpoints($, runtime)
    return { text: t(config, remove ? 'removed' : 'installed', { path }) }
  } catch (error) {
    return { text: t(config, 'fsError', { reason: excerpt(String(error)) }) }
  }
}

/** @param {import('claude-code').On} on @param {import('claude-code').PluginOptions} [options] */
export function register(on, options = {}) {
  const config = configuration(options)
  /** @type {Runtime} */
  const runtime = { checkpoints: [], cwd: '', interactive: false, activeTurn: null, timer: null, recoveryTimer: null,
    epoch: 0, inFlight: false, beat: 0, pose: 'idle' }

  on('session.start', async ($, e, next) => {
    runtime.interactive = e.isInteractive
    runtime.cwd = e.cwd
    cancelRecovery(runtime)
    if (runtime.interactive) {
      const state = await read($, canary)
      // Migrate 0.2 state on reload without losing the original death or streak.
      if (state.lastAutoCompactAt === undefined || state.recovery === 'pending' || state.recovery === 'compacting') {
        await update($, canary, /** @returns {Canary} */ (s) => ({ ...fresh(), ...s,
          recovery: s.recovery === 'pending' || s.recovery === 'compacting' ? 'interrupted' : s.recovery ?? 'idle' }))
      }
      await loadCheckpoints($, runtime)
      for (const name of ['canary', 'canario']) {
        await $.command.register({ name, description: t(config, 'command'), argumentHint: t(config, 'argumentHint') })
      }
      startClock($, runtime, state.alive)
    } else stopClock(runtime)
    return next(e)
  })

  on('session.end', ($, e, next) => {
    cancelRecovery(runtime)
    stopClock(runtime)
    runtime.activeTurn = null
    // /clear and /resume emit SessionStart, not another session.start.
    if (e.reason !== 'clear' && e.reason !== 'resume') runtime.interactive = false
    return next(e)
  })

  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    if (runtime.interactive && !e.agent_id) {
      cancelRecovery(runtime)
      runtime.activeTurn = null
      if (e.source === 'clear') await update($, canary, fresh)
      await loadCheckpoints($, runtime)
      startClock($, runtime, (await read($, canary)).alive)
    }
    return next(e)
  })

  on('turn.start', ($, e, next) => {
    if (runtime.interactive) runtime.activeTurn = e.turnId
    return next(e)
  })

  on('classic.PostCompact', async ($, e, next) => {
    const result = await next(e)
    // Our in-flight compact is settled by its result (including skip/failure),
    // preventing an early PostCompact from defeating the cooldown or reviving twice.
    if (runtime.interactive && !e.agent_id && !runtime.inFlight) await recovered($, runtime, config, false)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (!runtime.interactive || e.agentId) return result
    if (runtime.activeTurn === e.turnId) runtime.activeTurn = null
    if (e.isAborted || e.reason !== 'answer') return result
    const answer = e.answer.trim()
    if (!answer) return result
    const current = await read($, canary)
    if (!current.alive || current.lastTurnId === e.turnId) return result
    const lost = isAlive(answer, config.word) ? missingCheckpoints(answer, runtime.checkpoints) : []
    const valid = isAlive(answer, config.word) && lost.length === 0
    const at = valid ? 0 : await $.clock.now()
    let died = false
    await update($, canary, /** @returns {Canary} */ (state) => {
      died = false
      if (!state.alive || state.lastTurnId === e.turnId) return state
      const responses = state.responses + 1
      died = !valid
      const blocked = state.blocked || (!valid && state.lastAutoCompactAt !== null &&
        at - state.lastAutoCompactAt < config.cooldownMinutes * 60_000)
      return { ...state, alive: valid, responses, streak: state.streak + (valid ? 1 : 0), lastTurnId: e.turnId,
        death: valid ? null : { response: responses, at, preview: excerpt(answer), turnId: e.turnId,
          ...(lost.length ? { lost: lost.map(({ n, heading }) => ({ n, heading })) } : {}) },
        blocked, recovery: valid ? state.recovery : blocked ? 'blocked' : config.autoCompact ? 'pending' : 'notifyOnly', detail: '' }
    })
    if (!died) return result
    startClock($, runtime, false)
    const state = await read($, canary)
    if (state.death) {
      const { response, at: when, preview, turnId, lost: missing } = state.death
      const project = basename(await projectRoot($, runtime))
      await writeLog($, (log) => [...log, { at: when, project, response, preview, turnId,
        ...(missing ? { lost: missing } : {}), outcome: state.recovery }])
    }
    const message = (state.death?.lost?.length ? t(config, 'deathLost', { list: lostList(config, state.death.lost) }) : t(config, 'death')) +
      '\n' + note(config, state)
    $.ui.toast(message, { timeoutMs: 8000 })
    if (state.recovery === 'pending') scheduleRecovery($, runtime, config)
    const annotation = result.text && result.text !== e.answer ? result.text + '\n' : ''
    return { ...result, text: annotation + message }
  })

  on('command.run', { command: ['canary', 'canario'] }, async ($, e) => {
    if (!runtime.interactive) return {}
    const action = normalize(e.args.trim())
    if (['setup', 'init', 'configurar'].includes(action)) return instructionFile($, runtime, config, false)
    if (['remove', 'uninstall', 'quitar'].includes(action)) return instructionFile($, runtime, config, true)
    const before = await read($, canary)
    if (['status', 'estado'].includes(action)) return { text: status(config, before) }
    if (['log', 'history', 'historial'].includes(action)) return { text: await deathLog($, config) }
    if (!['', 'revive', 'revivir', 'reset'].includes(action)) return { text: t(config, 'help') }
    if (runtime.inFlight) return { text: status(config, before) }
    cancelRecovery(runtime)
    // Manual revival must not erase the automatic recovery window or lock.
    await update($, canary, /** @returns {Canary} */ (s) => ({ ...fresh(), lastTurnId: s.lastTurnId,
      lastAutoCompactAt: s.lastAutoCompactAt, blocked: s.blocked, recovery: s.blocked ? 'blocked' : 'idle' }))
    startClock($, runtime, true)
    if (!before.alive) await logOutcome($, 'revived')
    return { text: (action ? '' : status(config, before) + '\n') + t(config, before.alive ? 'stillAlive' : 'revived') }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const theirs = await next(e)
    if (!runtime.interactive || e.props.view?.agentId || e.props.hasSurvey) return theirs
    const columns = Math.max(0, Math.min(e.props.bodyColumns ?? 80, e.viewport?.columns ?? 80))
    const rows = Math.min(e.props.maxRows ?? 12, e.viewport?.rows ?? 12)
    if (columns < 1 || rows < 1) return theirs
    const state = await read($, canary)
    const elements = /** @type {Record<string, any>} */ ($.ui.resolve(e))
    const { Box, Text, Raster, Svg } = elements
    const dead = !state.alive
    const frame = dead ? 'dead' : runtime.pose
    const sprite = SPRITES[config.size]
    const pixels = sprite.frames[/** @type {keyof typeof sprite.frames} */ (frame)] ?? sprite.frames.idle
    const spriteRows = Math.ceil(sprite.height / 2)
    const short = '🐤 ' + t(config, dead ? 'dead' : 'alive')
    // Box and Text are shared by terminal and Desktop. Keep a text fallback
    // for a host/custom resolver that omits either constructor.
    if (!Box || !Text) return { type: 'Text', props: {}, children: [theirs, short] }
    const oneLine = (/** @type {string} */ value) => Box({ flexDirection: 'column', children: [theirs,
      Box({ key: 'canary', width: columns, height: 1, paddingLeft: 1, children: [Text({ wrap: 'truncate', color: dead ? 'gray' : 'yellow', children: [value] })] })] })
    if (columns < sprite.width + 1 || rows < spriteRows) return oneLine(config.info === 'details' ? status(config, state).replace(/\n/g, ' · ') : short)

    let art
    if (Raster && e.surface === 'terminal') {
      art = Raster({ key: 'canary-art', ...rasterCells(pixels, PALETTE) })
    } else if (Svg) {
      art = Svg({ source: svgSource(pixels, PALETTE, 4), alt: short, width: sprite.width * 4, height: sprite.height * 4 })
    } else return oneLine(short)

    const children = [Box({ key: 'canary-cage', flexShrink: 0, children: [art] })]
    if (config.info !== 'none') {
      /** @param {string} value @param {import('claude-code').TextProps} [props] */
      const label = (value, props = {}) => Text({ wrap: 'truncate', ...props, children: [value] })
      const labels = [label(t(config, dead ? 'dead' : 'alive'), { color: dead ? 'gray' : 'yellow', bold: true })]
      if (config.info === 'details') labels.push(label(t(config, 'streak', { streak: state.streak })))
      if (config.info === 'details' && dead && state.death) {
        labels.push(label(t(config, 'diedAt', { response: state.death.response,
          minutes: Math.max(0, Math.floor(((await $.clock.now()) - state.death.at) / 60_000)) })))
        labels.push(label(t(config, 'preview', { preview: state.death.preview }), { dimColor: true }))
      }
      const extra = config.info === 'details' ? note(config, state) : ''
      if (extra) labels.push(label(extra, { dimColor: true }))
      // Never taller than the cage: the band keeps the sprite's height.
      children.push(Box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, justifyContent: 'center',
        children: e.surface === 'terminal' ? labels.slice(0, spriteRows) : labels }))
    }
    return Box({ flexDirection: 'column', children: [theirs, Box({ key: 'canary', flexDirection: 'row',
      columnGap: 2, paddingLeft: 1, width: columns, height: e.surface === 'terminal' ? spriteRows : undefined, children })] })
  })
}
