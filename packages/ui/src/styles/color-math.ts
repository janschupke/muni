// Colour maths for the contrast contracts: the token test (tokens.css read as data) and the
// e2e check of rendered pages. Colours are sRGB channels 0–255 with an alpha 0–1.

export type Rgba = readonly [r: number, g: number, b: number, a: number]

/** `#rrggbb`, `rgb(r g b / a)`, `rgb(r, g, b)` or `rgba(r, g, b, a)`; alpha may be a percentage. */
export function parseColor(css: string): Rgba {
  const value = css.trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(value)?.[1]
  if (hex) {
    const n = parseInt(hex, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const body = /^rgba?\((.+)\)$/i.exec(value)?.[1]
  if (!body) throw new Error(`cannot parse colour ${css}`)
  const [r = 0, g = 0, b = 0, a = 1] = body
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(part => (part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part)))
  return [r, g, b, a]
}

/** `top` painted over `bottom`; the result is as opaque as `bottom` makes it. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top[3] + bottom[3] * (1 - top[3])
  if (a === 0) return [0, 0, 0, 0]
  const mix = (i: 0 | 1 | 2) => (top[i] * top[3] + bottom[i] * bottom[3] * (1 - top[3])) / a
  return [mix(0), mix(1), mix(2), a]
}

const linear = (channel: number) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** OKLab coordinates [L, a, b] of an opaque colour. */
export function oklab([r8, g8, b8]: Rgba): [number, number, number] {
  const [r, g, b] = [linear(r8), linear(g8), linear(b8)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

/** OKLab distance; about 0.02 is the smallest difference a reader reliably sees. */
export function deltaE(x: Rgba, y: Rgba): number {
  const [a, b] = [oklab(x), oklab(y)]
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

const luminance = ([r, g, b]: Rgba) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)

/** WCAG contrast ratio of two opaque colours (1–21). */
export function contrast(x: Rgba, y: Rgba): number {
  const [a, b] = [luminance(x), luminance(y)]
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

/** The minimum separation and contrasts the contracts hold everything to. */
export const MIN = {
  /** A filled shape (field, track, well, cell) against what it sits on. */
  separation: 0.02,
  /** WCAG 1.4.11: a control's boundary, a meaningful graphic. */
  nonText: 3,
  /** WCAG 1.4.3: body text, placeholders. */
  text: 4.5,
  /** Signal colours side by side (stacked bar segments, legend dots) told apart by hue. */
  categorical: 0.09,
  /**
   * A coloured ink (a link, warning text) against the neutral text greys: read as a colour,
   * not as one more grey. Amber at text contrast in the light theme reaches about 0.11.
   */
  ink: 0.1,
} as const
