import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'
import type { Result } from 'axe-core'

import { expectButtonGroups } from './buttons'
import { expectLinksDistinct, expectRenderedContrast, textContrastFailures } from './contrast'
import { expectTablesPaged } from './paging'

// WCAG 2.2 A/AA plus axe's best practices; any violation fails. Each state is also checked
// for what axe does not judge: fills that blend into what they sit on, control outlines and
// meter fills under 3:1 (support/contrast.ts).
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

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

/**
 * `exclude`: parts of the page that are not the app's to judge, each named where it is passed
 * (a development instance's Clerk footer).
 */
export async function expectNoViolations(
  page: Page,
  label: string,
  within?: string,
  exclude: string[] = []
) {
  const builder = new AxeBuilder({ page }).withTags(TAGS)
  if (within) builder.include(within)
  for (const selector of exclude) builder.exclude(selector)
  const { violations, incomplete } = await builder.analyze()
  const summary = violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes
      .map(n => `${n.target.join(' ')} ${n.html.slice(0, 120)} ${n.failureSummary ?? ''}`)
      .slice(0, 5),
  }))
  expect(summary, label).toEqual([])
  await expectUnsettledJudged(page, label, incomplete)
  await expectRenderedContrast(page, label, within)
  await expectLinksDistinct(page, label, within)
  await expectButtonGroups(page, label, within)
  if (!within) {
    await expectStructure(page, label)
    await expectTablesPaged(page, label)
  }
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
