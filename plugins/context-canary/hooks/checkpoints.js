// Checkpoints: code words spread through CLAUDE.md, so the canary samples more than the line that holds the rule.
// A live canary with only a prefix proves that one line survived; with checkpoints, every answer has to carry a
// word from the start, the middle and the end of the file, and a missing word says which part was lost.

/** Lines the mod owns. Constant and untranslated, so remove and re-setup always find them. */
export const CHECKPOINT = /^> context-canary checkpoint (\d+)\/(\d+): ([a-z]+)\s*$/

const WORDS = ['amber', 'anchor', 'apple', 'arrow', 'aspen', 'bamboo', 'basil', 'beacon', 'birch', 'bison', 'cactus',
  'cedar', 'cobalt', 'comet', 'coral', 'cotton', 'delta', 'ember', 'falcon', 'fern', 'fjord', 'garnet', 'ginger',
  'harbor', 'hazel', 'iris', 'jasper', 'juniper', 'kayak', 'lagoon', 'lantern', 'lemon', 'lotus', 'maple', 'marble',
  'meadow', 'nectar', 'nutmeg', 'olive', 'orbit', 'pebble', 'pepper', 'piano', 'quartz', 'raven', 'river', 'saffron',
  'sequoia', 'sierra', 'tundra', 'velvet', 'walnut', 'willow', 'zephyr']

/** @param {number} count @param {() => number} [random] */
export function pickCodes(count, random = Math.random) {
  const pool = [...WORDS]
  const codes = []
  for (let i = 0; i < count && pool.length; i++) codes.push(pool.splice(Math.floor(random() * pool.length), 1)[0])
  return codes
}

/** @typedef {{ n: number, code: string, heading: string }} Checkpoint */

/**
 * Place `codes.length` checkpoint lines at even fractions of the file (25 %, 50 %, 75 % for three), each one just
 * before the closest Markdown heading so it never splits a paragraph, after removing any previous ones.
 * @param {string} text @param {string[]} codes @param {string} newline
 * @returns {{ text: string, checkpoints: Checkpoint[] }}
 */
export function placeCheckpoints(text, codes, newline = '\n') {
  // Take out earlier checkpoints together with the blank line each one brought.
  const lines = []
  const raw = text.split(/\r?\n/)
  for (let i = 0; i < raw.length; i++) {
    if (!CHECKPOINT.test(raw[i])) { lines.push(raw[i]); continue }
    if (raw[i + 1] === '' && i + 1 < raw.length - 1) i++
    else if (lines[lines.length - 1] === '') lines.pop()
  }
  if (!codes.length) return { text: lines.join(newline), checkpoints: [] }
  const headings = lines.map((line, i) => (/^#{1,6}\s/.test(line) ? i : -1)).filter((i) => i > 0)
  const used = new Set()
  /** @type {{ at: number, n: number, code: string }[]} */
  const inserts = codes.map((code, k) => {
    const target = Math.round((lines.length * (k + 1)) / (codes.length + 1))
    const free = headings.filter((h) => !used.has(h))
    const at = free.length ? free.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a)) : target
    used.add(at)
    return { at, n: k + 1, code }
  }).sort((a, b) => a.at - b.at || a.n - b.n)
  // Number them in file order, so checkpoint 1 is always the one closest to the top.
  inserts.forEach((x, i) => { x.n = i + 1; x.code = codes[i] })
  /** @type {Checkpoint[]} */
  const checkpoints = []
  const out = []
  let next = 0
  lines.forEach((line, i) => {
    while (next < inserts.length && inserts[next].at === i) {
      const { n, code } = inserts[next++]
      out.push(`> context-canary checkpoint ${n}/${codes.length}: ${code}`, '')
      checkpoints.push({ n, code, heading: /^#{1,6}\s/.test(line) ? line.replace(/^#+\s*/, '').trim() : '' })
    }
    out.push(line)
  })
  while (next < inserts.length) {
    const { n, code } = inserts[next++]
    out.push('', `> context-canary checkpoint ${n}/${codes.length}: ${code}`)
    checkpoints.push({ n, code, heading: '' })
  }
  return { text: out.join(newline), checkpoints }
}

/** @param {string} text */
const fold = (text) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Which checkpoints the first line of an answer is missing (an empty list when all are there).
 * @param {string} answer @param {Checkpoint[]} checkpoints
 */
export function missingCheckpoints(answer, checkpoints) {
  const first = fold(answer.trim().split(/\r?\n/).find((line) => line.trim()) ?? '')
  return checkpoints.filter(({ code }) => !new RegExp(`(^|[^\\p{L}\\p{N}_])${code}(?![\\p{L}\\p{N}_])`, 'u').test(first))
}
