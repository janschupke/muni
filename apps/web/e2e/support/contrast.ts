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

interface LinkPaint {
  label: string
  color: Rgba
  /** The text colour of the block the link sits in, and of the page's body. */
  block: Rgba
  body: Rgba
  underlined: boolean
  /** The block has words of its own besides the link: the link sits in running text. */
  inText: boolean
}

// Each link that reads as words (icon links are judged as icon buttons, links drawn as
// buttons or tabs by their fill and border), with its colour and its surroundings'.
const COLLECT_LINKS = `(({ root }) => {
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
  const scope = root ? document.querySelector(root) : document
  if (!scope) return []
  return [...scope.querySelectorAll('a[href]')]
    .filter(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    .filter(el => {
      const box = el.getBoundingClientRect()
      return box.width > 1 && box.height > 1
    })
    // Navigation and tabs mark the current page their own way; a link drawn as a button
    // or the app's mark (data-slot) is judged by its shape.
    .filter(el => !el.closest('nav, [role=tablist], [role=tab]') && !el.hasAttribute('data-slot'))
    .filter(el => (el.textContent || '').trim() !== '')
    .filter(el => {
      const style = getComputedStyle(el)
      const filled = rgba(style.backgroundColor)[3] > 0
      const bordered = parseFloat(style.borderTopWidth) > 0 && rgba(style.borderTopColor)[3] > 0
      return !filled && !bordered
    })
    .map(el => {
      // The block a node's words flow in: its nearest ancestor that is not laid out inline.
      const blockOf = node => {
        let at = node.parentElement
        while (at && getComputedStyle(at).display.startsWith('inline')) at = at.parentElement
        return at || document.body
      }
      const block = blockOf(el)
      // Words on the link's own lines: text flowing in the same block, not a line of its own.
      let outside = ''
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (el.contains(node) || blockOf(node) !== block) continue
        const host = node.parentElement
        if (host && (host.closest('a, button, [aria-hidden=true]') || !host.checkVisibility())) continue
        outside += node.textContent
      }
      const style = getComputedStyle(el)
      return {
        label: '"' + (el.textContent || '').trim().slice(0, 40) + '" → ' + el.getAttribute('href'),
        color: rgba(style.color),
        block: rgba(getComputedStyle(block).color),
        body: rgba(getComputedStyle(document.body).color),
        underlined: style.textDecorationLine.includes('underline'),
        inText: /\\p{L}{2,}/u.test(outside),
      }
    })
})`

/**
 * A link has to look like one before it is hovered (WCAG 1.4.1): underlined, or a colour
 * plainly apart from the page's text and from the text around it; in running text, an
 * underline or 3:1 against the words around it. axe's own rule passes a link the colour of
 * its text, and skips links alone in a table cell or laid out as flex.
 */
export async function expectLinksDistinct(page: Page, label: string, root?: string) {
  const links: LinkPaint[] = await page.evaluate(`${COLLECT_LINKS}(${JSON.stringify({ root })})`)
  const problems = links.flatMap(link => {
    if (link.underlined) return []
    const fromBody = deltaE(link.color, link.body)
    const fromBlock = deltaE(link.color, link.block)
    if (fromBody < MIN.categorical || fromBlock < MIN.categorical)
      return [
        `${link.label}: not underlined, ΔE ${Math.min(fromBody, fromBlock).toFixed(3)} from the text`,
      ]
    const ratio = contrast(link.color, link.block)
    return link.inText && ratio < MIN.nonText
      ? [`${link.label}: in running text, not underlined, ${ratio.toFixed(2)}:1 against it`]
      : []
  })
  expect(problems, `${label}: links that look like text`).toEqual([])
}

/** Text whose contrast axe could not settle, measured here: its painted layers composited. */
const COLLECT_TEXT = `(({ selectors }) => {
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
  return selectors.flatMap(selector => {
    const el = document.querySelector(selector)
    if (!el) return []
    const chain = []
    for (let node = el; node; node = node.parentElement) chain.unshift(layers(node))
    const style = getComputedStyle(el)
    return [{
      selector,
      chain,
      color: rgba(style.color),
      size: parseFloat(style.fontSize),
      weight: Number(style.fontWeight),
    }]
  })
})`

/**
 * The contrast of each text the selectors name, against everything painted under it (pinned
 * cells over their row's fill, a hovered row's tint): what fails 4.5:1, or 3:1 for large text.
 */
export async function textContrastFailures(page: Page, selectors: string[]): Promise<string[]> {
  if (selectors.length === 0) return []
  const texts: {
    selector: string
    chain: Painted['chain']
    color: Rgba
    size: number
    weight: number
  }[] = await page.evaluate(`${COLLECT_TEXT}(${JSON.stringify({ selectors })})`)
  return texts.flatMap(({ selector, chain, color, size, weight }) => {
    const under = paint(chain, chain.length)
    const ratio = contrast(composite(color, under), under)
    const large = size >= 24 || (size >= 18.66 && weight >= 700)
    const min = large ? MIN.nonText : MIN.text
    return ratio < min ? [`${selector}: text ${ratio.toFixed(2)}:1 (needs ${String(min)})`] : []
  })
}
