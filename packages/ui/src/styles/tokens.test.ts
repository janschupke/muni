import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// Reads tokens.css as data: ramps are hex values, roles are light-dark() pairs of ramps or
// aliases of other roles. Checks that a form control never shares its container's fill.

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')

const pairs = (pattern: RegExp) =>
  new Map([...css.matchAll(pattern)].map(([, key = '', value = '']) => [key, value.trim()]))
const ramps = pairs(/--ramp-([\w-]+):\s*(#[0-9a-f]{6});/gi)
const roles = pairs(/--(p-[\w-]+):\s*([^;]+);/g)

type Theme = 'light' | 'dark'

function resolve(value: string, theme: Theme): string {
  const [, light, dark] = /^light-dark\((.+),\s*(var\(.+\))\)$/.exec(value) ?? []
  if (light && dark) return resolve(theme === 'light' ? light : dark, theme)
  const [, name] = /^var\(--([\w-]+)\)$/.exec(value) ?? []
  if (!name) throw new Error(`cannot resolve ${value}`)
  if (name.startsWith('ramp-')) {
    const hex = ramps.get(name.slice('ramp-'.length))
    if (!hex) throw new Error(`no ramp ${name}`)
    return hex
  }
  const role = roles.get(name)
  if (!role) throw new Error(`no role ${name}`)
  return resolve(role, theme)
}

const role = (name: string, theme: Theme) => resolve(`var(--p-${name})`, theme)

const channels = (hex: string) =>
  [1, 3, 5].map(i => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

function oklab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const deltaE = (a: string, b: string) => {
  const [x, y] = [oklab(a), oklab(b)]
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
}

const luminance = (hex: string) => {
  const [r, g, b] = channels(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/** Each control fill, and the surfaces it is used on. */
const PLACEMENTS = [
  { control: 'control-on-base', surfaces: ['surface-base'] },
  { control: 'control-on-raised', surfaces: ['surface-elevated', 'surface-overlay'] },
] as const

describe('form control surfaces', () => {
  for (const theme of ['light', 'dark'] as const) {
    for (const { control, surfaces } of PLACEMENTS) {
      for (const surface of surfaces) {
        it(`${control} stands apart from ${surface} (${theme})`, () => {
          expect(deltaE(role(control, theme), role(surface, theme))).toBeGreaterThanOrEqual(0.02)
        })
      }
      it(`placeholder and text read on ${control} (${theme})`, () => {
        expect(contrast(role('fg-subtle', theme), role(control, theme))).toBeGreaterThanOrEqual(4.5)
        expect(contrast(role('fg', theme), role(control, theme))).toBeGreaterThanOrEqual(7)
      })
    }
  }

  it('a control on the page is raised like a card', () => {
    expect(roles.get('p-control-on-base')).toBe('var(--p-surface-elevated)')
    expect(css).toContain('--control-surface: var(--p-control-on-base);')
    expect(css).toMatch(/@utility raised \{\s*--control-surface: var\(--p-control-on-raised\);/)
  })
})
