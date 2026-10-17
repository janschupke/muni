import { composite, contrast, deltaE, MIN, type Rgba } from '@muni/ui/color-math'
import { expect, type Locator, type Page } from '@playwright/test'

// Colour checks on the rendered page, where context decides: the token test knows which
// roles meet, but only the page knows that a bar track sits in an opened row, or that a
// pinned cell's fill covers its row's hover. axe checks text; these check the rest.

/** One element's paint: its own layers and every ancestor's, root first. */
interface Painted {
  label: string
  /** [background-color, first colour of a background-image gradient or null] per element. */
  chain: [Rgba, Rgba | null][]
  border: Rgba | null
}

// Runs in the page, as a string so no build step can wrap it. Colours are normalised through
// a 1×1 canvas, which reads any CSS colour syntax (rgb, oklab, color-mix results).
const COLLECT = `(({ selector, root }) => {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  function rgba(css) {
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'
    ctx.fillStyle = css
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3] / 255]
  }
  function layers(el) {
    const style = getComputedStyle(el)
    const gradient = /^linear-gradient\\((.+?(?:\\)|[a-z]))\\s*,/.exec(style.backgroundImage)
    return [rgba(style.backgroundColor), gradient ? rgba(gradient[1]) : null]
  }
  const scope = root ? document.querySelector(root) : document
  if (!scope) return []
  return [...scope.querySelectorAll(selector)]
    .filter(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .filter(el => {
      const box = el.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    })
    .map(el => {
      const chain = []
      for (let node = el; node; node = node.parentElement) chain.unshift(layers(node))
      const style = getComputedStyle(el)
      const text = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40)
      const label = el.tagName.toLowerCase() + '.' + String(el.className).split(/\\s+/).slice(0, 4).join('.') + ' "' + text + '"'
      return {
        label,
        chain,
        border: parseFloat(style.borderTopWidth) > 0 ? rgba(style.borderTopColor) : null,
      }
    })
})`

async function collect(page: Page, selector: string, root?: string): Promise<Painted[]> {
  return page.evaluate(`${COLLECT}(${JSON.stringify({ selector, root })})`)
}

const WHITE: Rgba = [255, 255, 255, 1]

/** The colour the chain paints, everything from the root down to `depth` (exclusive). */
function paint(chain: Painted['chain'], depth = chain.length): Rgba {
  return chain.slice(0, depth).reduce<Rgba>((below, [color, gradient]) => {
    const filled = composite(color, below)
    return gradient ? composite(gradient, filled) : filled
  }, WHITE)
}

const own = ([color, gradient]: [Rgba, Rgba | null]) => color[3] > 0 || (gradient?.[3] ?? 0) > 0

/**
 * Every filled element either matches what it sits on (an opaque cover, such as a pinned
 * cell) or stands visibly apart from it; a fill nearly the same is a layer nobody can see.
 * Every enabled form control's outline has 3:1 against its surroundings, and every meter's
 * fill 3:1 against its track. Fills are judged against their ancestors; a portalled popover
 * is judged against the page.
 */
export async function expectRenderedContrast(page: Page, label: string, root?: string) {
  const fills = (await collect(page, '*', root)).flatMap(({ label: what, chain }) => {
    const self = chain.at(-1)
    if (!self || !own(self)) return []
    const under = paint(chain, chain.length - 1)
    const apart = deltaE(paint(chain), under)
    return apart > 0.001 && apart < MIN.separation
      ? [`${what}: ΔE ${apart.toFixed(3)} from what it sits on`]
      : []
  })

  const CONTROLS =
    'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):enabled, textarea:enabled, button[role=checkbox]:enabled, button[role=combobox]:enabled'
  const outlines = (await collect(page, CONTROLS, root)).flatMap(
    ({ label: what, chain, border }) => {
      if (!border) return []
      const under = paint(chain, chain.length - 1)
      const ratio = contrast(composite(border, under), under)
      return ratio < MIN.nonText ? [`${what}: outline ${ratio.toFixed(2)}:1`] : []
    }
  )

  const meters = (await collect(page, '[role=meter] > :first-child', root)).flatMap(
    ({ label: what, chain }) => {
      const track = paint(chain, chain.length - 1)
      const fill = paint(chain)
      const ratio = contrast(fill, track)
      // An empty meter has no fill to judge.
      return ratio > 1.01 && ratio < MIN.nonText
        ? [`${what}: fill ${ratio.toFixed(2)}:1 on its track`]
        : []
    }
  )

  expect([...fills, ...outlines, ...meters], label).toEqual([])
}

/** The painted colour of each cell in a row, its own layers and the row's included. */
async function cellColours(row: Locator): Promise<Rgba[]> {
  await row.evaluate(el => {
    el.setAttribute('data-hover-probe', '')
  })
  const cells = await collect(row.page(), '[data-hover-probe] > *')
  await row.evaluate(el => {
    el.removeAttribute('data-hover-probe')
  })
  return cells.map(cell => paint(cell.chain))
}

/**
 * Hovering a table's first row changes every one of its cells, pinned ones included: a cell
 * whose opaque fill hides the row's hover reads as a row that ignores the pointer.
 */
export async function expectRowHover(page: Page, label: string) {
  const tables = page.locator('table:visible')
  const problems: string[] = []
  for (let t = 0; t < (await tables.count()); t++) {
    const row = tables.nth(t).locator('tbody > tr').first()
    if ((await row.count()) === 0 || (await row.locator('> *').count()) < 2) continue
    await page.mouse.move(0, 0)
    const before = await cellColours(row)
    await row.hover({ position: { x: 4, y: 4 } })
    await page.evaluate(
      'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))'
    )
    const after = await cellColours(row)
    before.forEach((colour, i) => {
      const changed = after[i] ? deltaE(colour, after[i]) : 0
      if (changed < 0.005) problems.push(`table ${String(t)}, cell ${String(i)}: no hover`)
    })
  }
  await page.mouse.move(0, 0)
  expect(problems, label).toEqual([])
}
