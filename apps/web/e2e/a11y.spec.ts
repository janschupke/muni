import AxeBuilder from '@axe-core/playwright'
import { setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

import { APP_PAGES, pathOf } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

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

// Contrast is judged on the settled page: with motion reduced, the page fade-in is instant.
// An admin sees every page and every control.
test.use({ reducedMotion: 'reduce', storageState: storageState('admin') })

for (const theme of ['light', 'dark'] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await page
        .context()
        .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
      await page.addInitScript(value => {
        localStorage.setItem('muni.theme', value)
      }, theme)
    })

    test('the introduction, signed out', async ({ browser, baseURL }) => {
      // The runner applies this file's `use` options to new contexts too: clear the session.
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await setupClerkTestingToken({ context })
      await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
      const page = await context.newPage()
      await page.addInitScript(value => {
        localStorage.setItem('muni.theme', value)
      }, theme)
      await page.goto('/')
      await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible()
      await expectNoViolations(page, 'introduction')
      await context.close()
    })

    for (const entry of APP_PAGES) {
      test(`${entry.name} page`, async ({ page }) => {
        const path = await pathOf(entry, async url => {
          await page.goto(url)
          return page.content()
        })
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

    test('departments and positions with a row open to its people', async ({ page }) => {
      await page.goto('/departments')
      await page.getByRole('button', { name: 'People in Laboratoře' }).click()
      await expect(page.getByRole('table', { name: 'People of Laboratoře' })).toBeVisible()
      await expectNoViolations(page, 'department people')
      await page.goto('/positions')
      await page
        .getByRole('button', { name: /^People with the position / })
        .first()
        .click()
      await expect(page.getByRole('table', { name: /^People of / })).toBeVisible()
      await expectNoViolations(page, 'position people')
    })

    test('collapsed sidebar, and the navigation drawer on a phone', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto('/courses')
      await page.getByRole('button', { name: 'Collapse sidebar' }).click()
      await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
      await expectNoViolations(page, 'collapsed sidebar')
      await page.getByRole('button', { name: 'Expand sidebar' }).click()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'navigation drawer')
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
