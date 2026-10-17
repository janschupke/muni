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
  /** An inset ring drawn round the fill (the yellow warning fill's amber edge). */
  edge: Rgba | null
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
      const ring = [...style.boxShadow.matchAll(/((?:rgba?|oklab|oklch|color)\\([^)]*\\))\\s+0px\\s+0px\\s+0px\\s+([\\d.]+)px\\s+inset/g)]
        .map(m => ({ color: rgba(m[1]), width: parseFloat(m[2]) }))
        .find(r => r.width > 0 && r.color[3] > 0)
      return {
        label,
        chain,
        border: parseFloat(style.borderTopWidth) > 0 ? rgba(style.borderTopColor) : null,
        edge: ring ? ring.color : null,
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
    ({ label: what, chain, edge }) => {
      const track = paint(chain, chain.length - 1)
      const fill = paint(chain)
      // A fill too light for 3:1 (yellow) shows its length by its edge.
      const ratio = Math.max(
        contrast(fill, track),
        edge ? contrast(composite(edge, fill), track) : 0
      )
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
  /** Drawn by TextLink (`data-link`), the one way the app draws a link. */
  marked: boolean
  /** Under the pointer: the one state that underlines it. */
  hovered: boolean
  /** Words drawn on the link's line next to it (within 1em): the link sits in running text. */
  inText: boolean
}

// Each link that reads as words (icon links are judged as icon buttons, links drawn as
// buttons or tabs by their fill and border, Clerk's own by Clerk), with its colour and what
// is drawn around it.
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
  // Every word drawn on the page outside links, buttons and badges, as the boxes of its lines.
  // Where it sits in the markup does not matter: a label in a flex item beside a link reads as
  // the same sentence.
  const words = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/\\p{L}{2,}/u.test(node.textContent || '')) continue
    const host = node.parentElement
    if (!host || host.closest('a, button, [aria-hidden=true], [inert], [data-slot]')) continue
    if (!host.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    // Text for screen readers only lays out in full but is clipped to a pixel: not seen.
    const hostBox = host.getBoundingClientRect()
    if (hostBox.width <= 1 || hostBox.height <= 1) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const box of range.getClientRects())
      if (box.width > 1 && box.height > 1) words.push({ box, text: (node.textContent || '').trim() })
  }
  return [...scope.querySelectorAll('a[href]')]
    .filter(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true }))
    // Behind an open dialog or drawer: hidden from everyone until it closes.
    .filter(el => !el.closest('[aria-hidden=true], [inert]'))
    .filter(el => {
      const box = el.getBoundingClientRect()
      return box.width > 1 && box.height > 1
    })
    // Navigation and tabs mark the current page their own way; a link drawn as a button
    // or the app's mark (data-slot) is judged by its shape.
    .filter(el => !el.closest('nav, [role=tablist], [role=tab]') && !el.hasAttribute('data-slot'))
    .filter(el => !el.closest('[class*="cl-"]'))
    .filter(el => (el.textContent || '').trim() !== '')
    .filter(el => {
      const style = getComputedStyle(el)
      const filled = rgba(style.backgroundColor)[3] > 0
      const bordered = parseFloat(style.borderTopWidth) > 0 && rgba(style.borderTopColor)[3] > 0
      return !filled && !bordered
    })
    .map(el => {
      let block = el.parentElement
      while (block && getComputedStyle(block).display.startsWith('inline')) block = block.parentElement
      block = block || document.body
      const style = getComputedStyle(el)
      const em = parseFloat(style.fontSize)
      const lines = [...el.getClientRects()]
      const beside = words.find(({ box: word }) =>
        lines.some(line => {
          const overlap = Math.min(word.bottom, line.bottom) - Math.max(word.top, line.top)
          const gap = Math.max(word.left - line.right, line.left - word.right)
          return overlap > Math.min(word.height, line.height) / 2 && gap < em
        })
      )
      return {
        label: '"' + (el.textContent || '').trim().slice(0, 40) + '" → ' + el.getAttribute('href') +
          (beside ? ' (beside "' + beside.text.slice(0, 30) + '")' : ''),
        color: rgba(style.color),
        block: rgba(getComputedStyle(block).color),
        body: rgba(getComputedStyle(document.body).color),
        underlined: style.textDecorationLine.includes('underline'),
        marked: el.hasAttribute('data-link'),
        hovered: el.matches(':hover'),
        inText: beside !== undefined,
      }
    })
})`

/**
 * Every link reads as a link and looks like every other: drawn by TextLink, not underlined
 * until hovered, in a colour plainly apart from the text (ΔE), and never in running text, where
 * colour alone would have to reach 3:1 against the words beside it (WCAG 1.4.1) — which no link
 * blue can in the dark theme while keeping 4.5:1 on every surface.
 */
export async function expectLinksDistinct(page: Page, label: string, root?: string) {
  const links: LinkPaint[] = await page.evaluate(`${COLLECT_LINKS}(${JSON.stringify({ root })})`)
  const problems = links.flatMap(link => {
    const found: string[] = []
    if (!link.marked) found.push(`${link.label}: not a TextLink`)
    if (link.underlined !== link.hovered)
      found.push(
        link.hovered
          ? `${link.label}: hovered, not underlined`
          : `${link.label}: underlined before it is hovered`
      )
    const apart = Math.min(deltaE(link.color, link.body), deltaE(link.color, link.block))
    if (apart < MIN.categorical) found.push(`${link.label}: ΔE ${apart.toFixed(3)} from the text`)
    const ratio = contrast(link.color, link.block)
    if (link.inText && ratio < MIN.nonText)
      found.push(`${link.label}: in running text, ${ratio.toFixed(2)}:1 against it`)
    return found
  })
  expect(problems, `${label}: links that look like text, or unlike the other links`).toEqual([])
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
