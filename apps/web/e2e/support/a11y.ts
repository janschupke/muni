import { expect, type Page, test } from '@playwright/test'
import axe, { type AxeResults, type ElementContext, type Result, type RunOptions } from 'axe-core'

import { expectButtonGroups } from './buttons'
import {
  expectLinksDistinct,
  expectRenderedContrast,
  expectRowHover,
  textContrastFailures,
} from './contrast'
import { loaded } from './pages'
import { expectTablesPaged } from './paging'

// WCAG 2.2 A/AA plus axe's best practices; any violation fails. Each state is also checked
// for what axe does not judge: fills that blend into what they sit on, control outlines and
// meter fills under 3:1 (support/contrast.ts).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']
// The rules whose verdict a theme can change: the others read the markup alone.
const COLOUR_RULES = ['color-contrast', 'link-in-text-block']

/**
 * axe in the page, injected once per document. The app draws no frames of its own; a third
 * party's (a captcha) is not the app's to judge, so frames are left out. Only violations and
 * what axe could not settle come back node by node.
 */
async function runAxe(page: Page, context: ElementContext, rules?: string[]): Promise<AxeResults> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(axe.source)
  const options: RunOptions = {
    runOnly: rules ? { type: 'rule', values: rules } : { type: 'tag', values: TAGS },
    iframes: false,
    resultTypes: ['violations', 'incomplete'],
  }
  return page.evaluate(`axe.run(${JSON.stringify(context)}, ${JSON.stringify(options)})`)
}

/**
 * What axe could not settle is judged here, never passed: text contrast is measured from the
 * painted layers (axe gives up under sticky cells and overlaps); a link's look against its
 * text is expectLinksDistinct's, which judges every link.
 */
async function expectUnsettledJudged(page: Page, label: string, incomplete: Result[]) {
  const contrastTargets = incomplete
    .filter(r => r.id === 'color-contrast')
    .flatMap(r => r.nodes.map(n => n.target.join(' ')))
  expect(
    await textContrastFailures(page, [...new Set(contrastTargets)]),
    `${label}: text contrast axe could not settle`
  ).toEqual([])
}

interface Check {
  /** The part of the page to judge: an open dialog or listbox hides the rest. */
  within?: string
  /** Parts of the page that are not the app's to judge, each named where it is passed. */
  exclude?: string[]
  /** A state that changes only how things are painted (hovered, focused): its colours alone. */
  paintOnly?: boolean
  /** Each table's first row under the pointer as well (expectRowHover). */
  rowHover?: boolean
}

/** axe's rules (or its colour rules alone), then what it could not settle. */
async function expectAxeClean(page: Page, label: string, check: Check, rules?: string[]) {
  const context: ElementContext = {
    ...(check.within ? { include: [check.within] } : {}),
    exclude: check.exclude ?? [],
  }
  const { violations, incomplete } = await runAxe(page, context, rules)
  const summary = violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes
      .map(n => `${n.target.join(' ')} ${n.html.slice(0, 120)} ${n.failureSummary ?? ''}`)
      .slice(0, 5),
  }))
  expect(summary, label).toEqual([])
  await expectUnsettledJudged(page, label, incomplete)
}

/** Everything that reads the colours: judged in each theme. */
async function expectColours(page: Page, label: string, check: Check) {
  await expectRenderedContrast(page, label, check.within)
  await expectLinksDistinct(page, label, check.within)
  if (check.rowHover) await expectRowHover(page, label)
}

/**
 * What axe does not check: one h1 per page, headings that never skip a level going down
 * (an h2 then an h4 hides a level from heading navigation), and every table named.
 */
async function expectStructure(page: Page, label: string) {
  // With a dialog open the page behind it is hidden: the dialog is checked by axe alone.
  if ((await page.getByRole('dialog').count()) > 0) return
  const { levels, unnamed } = await page.evaluate(() => {
    const visible = (el: Element) => !el.closest('[aria-hidden="true"], [hidden]')
    const levels = [
      ...document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6'),
    ]
      .filter(visible)
      .map(h => Number(h.tagName.slice(1)))
    const unnamed = [...document.querySelectorAll('table')]
      .filter(visible)
      .filter(
        t =>
          !t.getAttribute('aria-label') &&
          !t.getAttribute('aria-labelledby') &&
          !t.querySelector('caption')?.textContent.trim()
      ).length
    return { levels, unnamed }
  })
  expect(
    levels.filter(l => l === 1),
    `${label}: one h1`
  ).toHaveLength(1)
  const skips = levels.flatMap((level, i) => {
    const before = levels[i - 1]
    return before !== undefined && level > before + 1 ? [`h${before} → h${level}`] : []
  })
  expect(skips, `${label}: heading levels`).toEqual([])
  expect(unnamed, `${label}: tables without a name`).toBe(0)
}

type Theme = 'light' | 'dark'

const shownTheme = (page: Page) =>
  page.evaluate(
    (): Theme =>
      (document.documentElement.dataset['theme'] as Theme | undefined) ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  )

/**
 * Switches the theme in place, as the boot script applies a stored one (`data-theme`), so an
 * open dialog, an expanded row or a hovered control stays as it is. Nothing is stored: the
 * worker's saved browser state never carries a theme into another test.
 */
async function showTheme(page: Page, theme: Theme) {
  await page.evaluate(value => {
    document.documentElement.dataset['theme'] = value
  }, theme)
  // The colours ease from one theme to the other: judge them once they have arrived.
  await page.waitForFunction(() =>
    document.getAnimations().every(animation => animation.playState !== 'running')
  )
}

/**
 * The page as it stands, in both themes. In the theme it shows, everything: axe, the painted
 * colours, and (for a whole page) its headings, tables and button groups; then, in the other
 * theme, what a theme can change: axe's colour rules and the painted colours. Each theme is a
 * step of its own, so a failure names it.
 */
export async function expectAccessible(page: Page, label: string, check: Check = {}) {
  // The page itself, never its loading state: a click shows that first.
  await loaded(page)
  const first = await shownTheme(page)

  await test.step(`${label}, ${first} theme`, () => expectAll(page, label, check))

  const second: Theme = first === 'light' ? 'dark' : 'light'

  await test.step(`${label}, ${second} theme`, async () => {
    await showTheme(page, second)
    await expectAxeClean(page, label, check, COLOUR_RULES)
    await expectColours(page, label, check)
  })
}

/** Everything, in the theme the page shows; a paint-only state, its colours alone. */
async function expectAll(page: Page, label: string, check: Check) {
  await expectAxeClean(page, label, check, check.paintOnly ? COLOUR_RULES : undefined)
  if (!check.paintOnly) {
    await expectButtonGroups(page, label, check.within)
    if (!check.within) {
      await expectStructure(page, label)
      await expectTablesPaged(page, label)
    }
  }
  await expectColours(page, label, check)
}
