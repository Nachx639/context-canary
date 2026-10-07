// Pixel-art helpers: a frame is an array of strings, one character per pixel,
// '.' transparent and every other character a key of the palette.

/** The terminal's own color, for transparent pixels. */
export const DEFAULT_COLOR = 0x01000000
const UPPER = 0x2580 // ▀
const LOWER = 0x2584 // ▄

/** @param {string} hex '#rrggbb' */
const rgb = (hex) => parseInt(hex.slice(1), 16)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Standard padded base64; no reliance on Uint8Array#toBase64 or btoa. @param {Uint8Array} bytes */
export function base64(bytes) {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2]
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0)
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] +
      (b === undefined ? '=' : B64[(n >> 6) & 63]) + (c === undefined ? '=' : B64[n & 63])
  }
  return out
}

/**
 * Pack a frame into Raster cells with half blocks: each terminal cell shows two
 * pixels stacked, the upper as the glyph's color and the lower as its background.
 * @param {string[]} frame @param {Record<string, string>} palette @param {(hex: string) => string} [tint]
 */
export function rasterCells(frame, palette, tint = (hex) => hex) {
  const columns = Math.max(...frame.map((row) => row.length))
  const rows = Math.ceil(frame.length / 2)
  /** @param {number} x @param {number} y */
  const color = (x, y) => {
    const key = frame[y]?.[x]
    return key && key !== '.' && palette[key] ? rgb(tint(palette[key])) : null
  }
  const words = new Uint32Array(columns * rows * 3)
  for (let r = 0; r < rows; r++) {
    for (let x = 0; x < columns; x++) {
      const top = color(x, 2 * r)
      const bottom = color(x, 2 * r + 1)
      const i = (r * columns + x) * 3
      if (top === null && bottom === null) words.set([0x20, DEFAULT_COLOR, DEFAULT_COLOR], i)
      else if (bottom === null) words.set([UPPER, /** @type {number} */ (top), DEFAULT_COLOR], i)
      else if (top === null) words.set([LOWER, bottom, DEFAULT_COLOR], i)
      else words.set([UPPER, top, bottom], i)
    }
  }
  // Raster wants little-endian u32 triplets.
  const bytes = new Uint8Array(words.length * 4)
  const view = new DataView(bytes.buffer)
  words.forEach((word, i) => view.setUint32(i * 4, word, true))
  return { columns, rows, cells: base64(bytes) }
}

/**
 * The same frame as an SVG of crisp rectangles, for surfaces without Raster.
 * @param {string[]} frame @param {Record<string, string>} palette @param {number} scale CSS pixels per pixel
 */
export function svgSource(frame, palette, scale) {
  const width = Math.max(...frame.map((row) => row.length))
  const rects = []
  frame.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const key = row[x]
      let run = 1
      while (row[x + run] === key) run++
      if (key !== '.' && palette[key]) rects.push(`<rect x="${x}" y="${y}" width="${run}" height="1" fill="${palette[key]}"/>`)
      x += run
    }
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${frame.length}" ` +
    `width="${width * scale}" height="${frame.length * scale}" shape-rendering="crispEdges">${rects.join('')}</svg>`
}
