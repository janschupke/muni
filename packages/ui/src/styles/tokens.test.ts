import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { composite, contrast, deltaE, MIN, oklab, parseColor, type Rgba } from './color-math'

// The colour contract. tokens.css is read as data (ramps are hex values, roles are colours,
// aliases or light-dark() pairs of them), and every pairing the UI renders is checked in
// both themes: a filled shape against what it sits on (OKLab ΔE), a control's outline or a
// meaningful graphic (3:1), text (4.5:1). Translucent roles are composited over each surface
// first. A colour utility used anywhere in the app must belong to a pairing here, so a new
// use cannot skip the contract.

const css = readFileSync(join(import.meta.dirname, 'tokens.css'), 'utf8')

const pairs = (pattern: RegExp) =>
  new Map([...css.matchAll(pattern)].map(([, key = '', value = '']) => [key, value.trim()]))
const ramps = pairs(/--ramp-([\w-]+):\s*(#[0-9a-f]{6});/gi)
const roles = pairs(/--(p-[\w-]+):\s*([^;]+);/g)
/** Tailwind colour name (bg-<name>) → the role it reads. */
const utilities = pairs(/--color-([\w-]+):\s*var\(--(p-[\w-]+)\);/g)

type Theme = 'light' | 'dark'

/** Splits `a, b` at its top-level comma. */
function splitPair(value: string): [string, string] {
  let depth = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ',' && depth === 0) return [value.slice(0, i).trim(), value.slice(i + 1).trim()]
  }
  throw new Error(`no pair in ${value}`)
}

function resolve(value: string, theme: Theme): Rgba {
  const pair = /^light-dark\((.+)\)$/.exec(value)?.[1]
  if (pair) return resolve(splitPair(pair)[theme === 'light' ? 0 : 1], theme)
  const name = /^var\(--([\w-]+)\)$/.exec(value)?.[1]
  if (!name) return parseColor(value)
  if (name.startsWith('ramp-')) {
    const hex = ramps.get(name.slice('ramp-'.length))
    if (!hex) throw new Error(`no ramp ${name}`)
    return parseColor(hex)
  }
  const role = roles.get(name)
  if (!role) throw new Error(`no role ${name}`)
  return resolve(role, theme)
}

const role = (name: string, theme: Theme) => resolve(`var(--p-${name})`, theme)

/** A stack of roles, bottom first, as one opaque colour. */
const paint = (stack: readonly string[], theme: Theme) =>
  stack.reduce<Rgba>((below, name) => composite(role(name, theme), below), [0, 0, 0, 0])

const CANVAS = ['surface-base']
const RAISED = ['surface-elevated']
const OVERLAY = ['surface-overlay']
const WELL = ['surface-elevated', 'surface-sunken']
const CONTROL = ['control']
const CONTAINERS = [CANVAS, RAISED, OVERLAY]
const SURFACES = [CANVAS, RAISED, OVERLAY, WELL]
const TRACKS = SURFACES.map(s => [...s, 'chart-track'])
const SOFT = ['success', 'warning', 'serious', 'danger', 'info'] as const
const GREYS = [['fg'], ['fg-muted'], ['fg-subtle']]
/** The coloured text inks; info-fg is accent-text. */
const INKS = ['link', 'accent-text', 'success-fg', 'warning-fg', 'serious-fg', 'danger-fg']

type Kind = keyof typeof MIN
interface Pairing {
  kind: Kind
  /** The role painted on top (translucent ones are composited over each background). */
  fg: string
  on: readonly (readonly string[])[]
  why: string
}

const PAIRINGS: Pairing[] = [
  // The ladder: each layer stands apart from the one it sits on.
  { kind: 'separation', fg: 'surface-elevated', on: [CANVAS], why: 'cards on the page' },
  { kind: 'separation', fg: 'surface-sunken', on: [RAISED], why: 'wells in cards' },
  { kind: 'separation', fg: 'control', on: CONTAINERS, why: 'fields and buttons' },
  {
    kind: 'separation',
    fg: 'control',
    on: SURFACES.map(s => [...s, 'state-hover']),
    why: 'buttons and fields in a hovered row, a dialog’s included',
  },
  { kind: 'separation', fg: 'chart-track', on: SURFACES, why: 'bar tracks' },
  { kind: 'separation', fg: 'tint', on: SURFACES, why: 'skeletons, neutral badges' },
  {
    kind: 'separation',
    fg: 'state-hover',
    on: [...SURFACES, CONTROL],
    why: 'hovered rows, items, buttons',
  },
  { kind: 'separation', fg: 'state-active', on: [RAISED, CONTROL], why: 'pressed buttons' },
  { kind: 'separation', fg: 'state-selected', on: [RAISED, OVERLAY], why: 'current nav item' },
  ...SOFT.map((tone): Pairing => ({
    kind: 'separation',
    fg: `${tone}-soft`,
    on: [RAISED, WELL],
    why: 'tinted cells and rows',
  })),
  { kind: 'separation', fg: 'accent-soft', on: [RAISED], why: 'accent badges' },
  ...['full', 'high', 'fair', 'low', 'poor'].map((band): Pairing => ({
    kind: 'separation',
    fg: `heat-${band}`,
    on: [RAISED],
    why: 'heat cells',
  })),

  // Signal fills meet in stacked bars: each pair stays apart.
  ...['success-fill', 'warning-fill', 'serious-fill', 'danger-fill'].flatMap((fill, i, all) =>
    all.slice(i + 1).map((other): Pairing => ({
      kind: 'categorical',
      fg: fill,
      on: [[other]],
      why: 'neighbouring bar segments',
    }))
  ),

  // Outlines and graphics, WCAG 1.4.11.
  {
    kind: 'nonText',
    fg: 'border-control',
    on: [...CONTAINERS, CONTROL],
    why: 'a field’s outline',
  },
  {
    kind: 'nonText',
    fg: 'focus-ring',
    on: [...CONTAINERS, CONTROL],
    why: 'the focus outline',
  },
  // The warning fill is yellow, which never reaches 3:1 on white: its edge carries the shape.
  ...['accent', 'success-fill', 'warning-edge', 'serious-fill', 'danger-fill', 'info-fill'].map(
    (fill): Pairing => ({
      kind: 'nonText',
      fg: fill,
      on: [...SURFACES, ...TRACKS],
      why: 'bar fills (or their edge), status dots, stripes',
    })
  ),
  { kind: 'nonText', fg: 'accent', on: [RAISED], why: 'a checked checkbox' },

  // Text, WCAG 1.4.3.
  ...['fg', 'fg-muted', 'fg-subtle', 'accent-text', 'link'].map((ink): Pairing => ({
    kind: 'text',
    fg: ink,
    on: [
      ...SURFACES,
      CONTROL,
      ['surface-elevated', 'state-hover'],
      ['surface-elevated', 'state-selected'],
    ],
    why: 'text and placeholders',
  })),
  ...SOFT.map((tone): Pairing => ({
    kind: 'text',
    fg: `${tone}-fg`,
    on: [[`${tone}-soft`], RAISED, CANVAS, WELL],
    why: 'status text, badges, alerts',
  })),
  { kind: 'text', fg: 'accent-text', on: [['accent-soft']], why: 'accent badge' },
  { kind: 'text', fg: 'danger-fg', on: [CONTROL], why: 'destructive button' },

  // Coloured text reads as a colour: apart from every grey, and each from the others
  // (warning beside danger in one table). The link and accent-text are both blue.
  ...INKS.map((ink): Pairing => ({
    kind: 'ink',
    fg: ink,
    on: GREYS,
    why: 'a link or status text among plain text',
  })),
  ...INKS.slice(1).flatMap((ink, i, all) =>
    all.slice(i + 1).map((other): Pairing => ({
      kind: 'categorical',
      fg: ink,
      on: [[other]],
      why: 'status texts side by side',
    }))
  ),
  { kind: 'text', fg: 'accent-fg', on: [['accent'], ['accent-hover']], why: 'primary button' },
  { kind: 'text', fg: 'danger-ink', on: [['danger-fill']], why: 'danger button' },
  ...['full', 'high', 'fair', 'low', 'poor'].map((band): Pairing => ({
    kind: 'text',
    fg: `heat-${band}-ink`,
    on: [[`heat-${band}`]],
    why: 'rates printed in heat cells',
  })),
]

/** Roles used for something no pairing above describes. */
const EXEMPT = new Set([
  // Under every modal; not a surface anything is read against.
  'p-scrim',
  // Hairlines between things that already differ in fill or sit in a framed box.
  'p-border-default',
  'p-border-muted',
  'p-border-emphasis',
  // The primary button's hover is a darker blue with the same white text.
  'p-accent-hover',
  // Status borders frame badges and alerts whose fill and text are checked.
  'p-success-border',
  'p-warning-border',
  'p-serious-border',
  'p-danger-border',
  'p-info-border',
  // Chart hairlines with their values printed beside them.
  'p-chart-grid',
  'p-chart-axis',
])

/** A Tailwind class that paints a colour: `bg-surface-elevated` → `surface-elevated`. */
const COLOUR_UTILITY =
  /^(?:bg|text|border(?:-[trblxy])?|divide|outline|(?:inset-)?ring|fill|stroke|from|via|to|decoration|placeholder|caret|accent)-([a-z-]+)$/

const ratio = (kind: Kind, fg: string, on: readonly string[], theme: Theme) => {
  const base = paint(on, theme)
  const top = composite(role(fg, theme), base)
  return kind === 'separation' || kind === 'categorical' || kind === 'ink'
    ? deltaE(top, base)
    : contrast(top, base)
}

describe('colour contract', () => {
  for (const theme of ['light', 'dark'] as const) {
    it(`the ladder: page, card, overlay, control get lighter (${theme})`, () => {
      const l = (name: string) => oklab(role(name, theme))[0]
      expect(l('surface-base')).toBeLessThan(l('surface-elevated'))
      expect(l('surface-elevated')).toBeLessThanOrEqual(l('surface-overlay'))
      expect(l('surface-overlay')).toBeLessThan(l('control'))
      expect(l('surface-sunken')).toBeLessThan(l('surface-elevated'))
    })

    for (const { kind, fg, on, why } of PAIRINGS) {
      for (const stack of on) {
        it(`${fg} on ${stack.join(' + ')}: ${why} (${theme})`, () => {
          expect(ratio(kind, fg, stack, theme)).toBeGreaterThanOrEqual(MIN[kind])
        })
      }
    }
  }

  // Sentiment reads from the colour itself: a warning bar is yellow, not brown (dark yellow),
  // and danger is red, not pink (light red short of chroma), in both themes.
  const lch = (name: string, theme: Theme) => {
    const [l, a, b] = oklab(role(name, theme))
    return { l, c: Math.hypot(a, b), h: (Math.atan2(b, a) * 180) / Math.PI }
  }
  for (const theme of ['light', 'dark'] as const) {
    it(`the warning fill is a clear yellow (${theme})`, () => {
      const { l, c, h } = lch('warning-fill', theme)
      expect(h).toBeGreaterThanOrEqual(70)
      expect(h).toBeLessThanOrEqual(100)
      expect(l).toBeGreaterThanOrEqual(0.75)
      expect(c).toBeGreaterThanOrEqual(0.14)
    })
    it(`the danger fill is a full red (${theme})`, () => {
      const { c, h } = lch('danger-fill', theme)
      expect(h).toBeGreaterThanOrEqual(20)
      expect(h).toBeLessThanOrEqual(35)
      expect(c).toBeGreaterThanOrEqual(0.17)
      expect(c / lch('danger-fill', theme).l).toBeGreaterThanOrEqual(0.3)
    })
  }

  it('every colour the app uses is in a pairing', () => {
    const covered = new Set(PAIRINGS.flatMap(p => [p.fg, ...p.on.flat()]).map(r => `p-${r}`))
    const roots = [
      join(import.meta.dirname, '..'),
      join(import.meta.dirname, '../../../../apps/web/src'),
    ]
    const used = new Map<string, string>()
    for (const root of roots) {
      for (const file of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
        if (!/\.tsx?$/.test(file) || /\.test\.tsx?$/.test(file)) continue
        const source = readFileSync(join(root, file), 'utf8')
        for (const [token] of source.matchAll(/[\w:[\]&/.!-]+/g)) {
          // `hover:bg-state-hover/50` → `bg-state-hover`
          const bare = (token.split(':').pop() ?? '').replace(/^!/, '').replace(/\/[\d.]+$/, '')
          const name = COLOUR_UTILITY.exec(bare)?.[1]
          const mapped = name === undefined ? undefined : utilities.get(name)
          if (mapped) used.set(mapped, file)
        }
        for (const [, name = ''] of source.matchAll(/var\(--color-([\w-]+)\)/g)) {
          const mapped = utilities.get(name)
          if (mapped) used.set(mapped, file)
        }
      }
    }
    // The scan itself works: it finds the everyday roles.
    expect([...used.keys()]).toEqual(
      expect.arrayContaining(['p-surface-elevated', 'p-fg-muted', 'p-control'])
    )
    const missing = [...used].filter(([r]) => !covered.has(r) && !EXEMPT.has(r))
    expect(missing).toEqual([])
  })
})
