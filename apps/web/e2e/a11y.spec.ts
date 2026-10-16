import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

import { PUBLIC_PAGES } from './support/pages'

// WCAG 2.2 A/AA plus axe's best practices; any violation fails.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']

async function expectNoViolations(page: Page, label: string, within?: string) {
  const builder = new AxeBuilder({ page }).withTags(TAGS)
  if (within) builder.include(within)
  const { violations } = await builder.analyze()
  const summary = violations.map(v => ({
    rule: v.id,
    impact: v.impact,
    targets: v.nodes.map(n => n.target.join(' ')).slice(0, 5),
  }))
  expect(summary, label).toEqual([])
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page
        .context()
        .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: 'http://localhost:3061' }])
      await page.addInitScript(value => {
        localStorage.setItem('muni.theme', value)
      }, theme)
    })

    for (const { name, path } of PUBLIC_PAGES) {
      test(`${name} page`, async ({ page }) => {
        await page.goto(path)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expectNoViolations(page, path)
      })
    }

    test('compliance matrix with a department open and a cell’s people shown', async ({ page }) => {
      await page.goto('/compliance')
      await page.getByRole('button', { name: 'People in Laboratoře' }).click()
      await expect(page.getByRole('list', { name: 'In the people rows:' })).toBeVisible()
      await expectNoViolations(page, 'expanded row')
      await page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'cell dialog')
    })

    test('employee list with a row open and a filter open', async ({ page }) => {
      await page.goto('/employees')
      await page
        .getByRole('button', { name: /^Details for / })
        .first()
        .click()
      await expect(page.getByRole('columnheader', { name: 'Valid until' })).toBeVisible()
      await expectNoViolations(page, 'expanded employee')
      await page.getByRole('combobox', { name: 'Department' }).click()
      await expect(page.getByRole('listbox')).toBeVisible()
      // An open listbox hides the rest of the page from assistive tech (Radix), so only the
      // listbox itself is audited in this state.
      await expectNoViolations(page, 'open select', '[role="listbox"]')
    })
  })
}
