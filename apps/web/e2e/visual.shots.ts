import path from 'node:path'

import { setupClerkTestingToken } from '@clerk/testing/playwright'
import type { Page } from '@playwright/test'

import { APP_PAGES, loaded, pathOf } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// Shots for review, not comparison: every page, and the states a page-load never shows.
// Nothing here saves a form or confirms a dialog, so the test database stays as seeded.

// Outside test-results/, which every Playwright run empties first.
const SHOTS = path.join(import.meta.dirname, '../visual-shots')

test.use({ storageState: storageState('admin'), viewport: { width: 1440, height: 900 } })

for (const theme of ['light', 'dark'] as const) {
  // Two frames first: a state just changed (a click, a hover) paints on the next one.
  const shot = async (page: Page, name: string, fullPage = true) => {
    await page.evaluate(
      'new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))'
    )
    await page.screenshot({ path: path.join(SHOTS, theme, `${name}.png`), fullPage })
  }

  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page, baseURL }) => {
      await page
        .context()
        .addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
      await page.addInitScript(value => {
        localStorage.setItem('muni.theme', value)
      }, theme)
    })

    test('introduction, signed out', async ({ browser, baseURL }) => {
      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
      await setupClerkTestingToken({ context })
      await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
      const page = await context.newPage()
      await page.addInitScript(value => {
        localStorage.setItem('muni.theme', value)
      }, theme)
      await page.goto('/')
      await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible()
      await shot(page, 'introduction')
      // Clerk's form in the app's colours, in each theme.
      await page.goto('/sign-in')
      await expect(page.locator('.cl-rootBox').first()).toBeVisible()
      await shot(page, 'sign-in')
      await context.close()
    })

    test('every page', async ({ page }) => {
      for (const entry of APP_PAGES) {
        const route = await pathOf(entry, async url => {
          await page.goto(url)
          await loaded(page)
          return page.content()
        })
        await page.goto(route)
        await loaded(page)
        await expect(page.locator('h1').first()).toBeVisible()
        await shot(page, `page-${entry.name}`)
      }
    })

    test('rows hovered and opened', async ({ page }) => {
      await page.goto('/employees')
      await loaded(page)
      await page.locator('tbody tr').first().hover()
      await shot(page, 'employees-row-hover', false)
      await page
        .getByRole('button', { name: /^Details for / })
        .first()
        .click()
      await expect(page.getByRole('columnheader', { name: 'Valid until' })).toBeVisible()
      await shot(page, 'employees-row-open', false)

      for (const list of ['/courses', '/departments', '/positions']) {
        await page.goto(list)
        await loaded(page)
        await page.locator('tbody button[aria-expanded="false"]').first().click()
        await page.locator('tbody tr').first().hover()
        await shot(page, `${list.slice(1)}-row-open`, false)
      }
      await page.goto('/sessions')
      await loaded(page)
      await page.locator('tbody tr').first().hover()
      await shot(page, 'sessions-row-hover', false)
    })

    test('compliance matrix: hover, open department, cell dialog', async ({ page }) => {
      await page.goto('/compliance')
      await loaded(page)
      await page.locator('tbody tr').first().hover()
      await shot(page, 'compliance-row-hover')
      await page.getByRole('button', { name: 'People in Laboratoře' }).click()
      await expect(page.getByRole('list', { name: 'In the people rows:' })).toBeVisible()
      await page.locator('tbody tr').nth(1).hover()
      await shot(page, 'compliance-open-hover')
      // A person's cell reached by keyboard: the focus ring and its words.
      const toggle = page.getByRole('button', { name: 'People in Laboratoře' })
      const firstPerson = page.locator(
        `[id="${(await toggle.getAttribute('aria-controls'))?.split(' ')[0] ?? ''}"]`
      )
      await firstPerson.getByRole('link').focus()
      await page.keyboard.press('Tab')
      await expect(firstPerson.getByRole('button').first()).toBeFocused()
      await page.mouse.move(0, 0)
      await page.keyboard.press('ArrowRight')
      // Only the focused cell's words: the one left behind closes.
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toHaveCount(1)
      await shot(page, 'compliance-person-cell-focus', false)
      await page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, 'compliance-cell-dialog', false)
    })

    test('forms: clean, edited, errors, disabled, popovers', async ({ page }) => {
      await page.goto('/employees/E0153/edit')
      await loaded(page)
      await shot(page, 'form-employee-clean')
      const first = page.getByRole('textbox', { name: /First name/ })
      await first.fill('')
      await page.getByRole('textbox', { name: /Email/ }).fill('not an email')
      await page.getByRole('textbox', { name: /Last name/ }).click()
      await shot(page, 'form-employee-errors')
      await first.fill('Jana')
      await shot(page, 'form-employee-dirty')
      await page.getByRole('combobox', { name: /Department/ }).click()
      await expect(page.getByRole('listbox')).toBeVisible()
      await shot(page, 'form-select-open', false)
      await page.keyboard.press('Escape')
      await page
        .getByRole('button', { name: /from a calendar$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, 'form-date-picker-open')
      await page.keyboard.press('Escape')

      await page.goto('/employees/new')
      await loaded(page)
      await shot(page, 'form-employee-new-disabled-checkbox')
      await page.getByRole('button', { name: 'Create employee' }).click()
      await shot(page, 'form-employee-new-submitted')

      await page.goto('/users')
      await loaded(page)
      await page.getByRole('link', { name: 'E2E Admin' }).first().click()
      await expect(page.getByRole('combobox').first()).toBeDisabled()
      await shot(page, 'form-own-role-disabled')
    })

    test('archive dialog (cancelled)', async ({ page }) => {
      await page.goto('/employees/E0153')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Archive/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, 'archive-dialog', false)
      await page.keyboard.press('Escape')
    })

    // No skeleton shots: pages arrive with their data from the server, so a skeleton shows
    // only when that read fails (past the read limit, a database error), which a browser
    // cannot cause. components.test.tsx renders each one.

    test('sidebar collapsed, phone drawer, phone page', async ({ page }) => {
      await page.goto('/courses')
      await loaded(page)
      await page.getByRole('button', { name: 'Collapse sidebar' }).click()
      await shot(page, 'sidebar-collapsed', false)
      await page.getByRole('button', { name: 'Expand sidebar' }).click()
      await page.setViewportSize({ width: 390, height: 844 })
      await shot(page, 'phone-courses')
      await page.getByRole('button', { name: 'Menu', exact: true }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await shot(page, 'phone-drawer', false)
      await page.keyboard.press('Escape')
      // The list scrolled sideways keeps the name in view; the filters fold behind a button.
      await page.goto('/employees')
      await loaded(page)
      await shot(page, 'phone-employees', false)
      await page.getByRole('button', { name: /^Filters/ }).click()
      await shot(page, 'phone-employees-filters', false)
      await page.getByRole('table', { name: 'Employees' }).evaluate(table => {
        table.parentElement?.scrollBy({ left: 400 })
      })
      await shot(page, 'phone-employees-scrolled', false)
      await page.goto('/sessions/T016')
      await loaded(page)
      await shot(page, 'phone-session')
    })

    test('advisor: choosing, booking and resolving, asked before anything is done', async ({
      page,
    }) => {
      await page.goto('/advisor?view=action')
      await loaded(page)
      await page.getByRole('link', { name: /^Remediation planned/ }).hover()
      await shot(page, 'advisor-tab-hover', false)
      await page
        .getByRole('checkbox', { name: /^Select .+, / })
        .first()
        .click()
      await shot(page, 'advisor-selected', false)
      await page.getByRole('button', { name: /^Book 1 selected/ }).click()
      const book = page.getByRole('dialog')
      await expect(book.getByRole('combobox').first()).toBeVisible()
      await shot(page, 'advisor-book-dialog', false)
      // The session it books: the proposal, or another it could take.
      await book.getByRole('combobox').first().click()
      await shot(page, 'advisor-book-dialog-sessions', false)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')

      // The same dialog from a person's list: every training they need, each to leave out.
      await page.goto('/employees')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Book every training .+ needs…$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible()
      await shot(page, 'person-book-dialog', false)
      await page.keyboard.press('Escape')

      await page.goto('/advisor?view=overbooked')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Resolve the overbooking of/ })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await shot(page, 'advisor-resolve-move', false)
      await dialog.getByRole('radio', { name: /Raise the capacity/ }).click()
      await shot(page, 'advisor-resolve-raise', false)
      await page.keyboard.press('Escape')
    })

    test('planner: an opened offer, its review and the checked summary', async ({ page }) => {
      await page.goto('/planner')
      await loaded(page)
      await page
        .getByRole('button', { name: /^People for / })
        .first()
        .click()
      await shot(page, 'planner-row-open', false)
      await page
        .getByRole('button', { name: /^Review session 1 of / })
        .first()
        .click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await shot(page, 'planner-review-edit', false)
      // The check runs on the server and writes nothing.
      await dialog.getByRole('button', { name: 'Check' }).click()
      await expect(dialog.getByText('What will be created')).toBeVisible()
      await shot(page, 'planner-review-summary', false)
      await page.keyboard.press('Escape')
    })

    test('past sessions of one course, the filter as a chip', async ({ page }) => {
      await page.goto('/sessions?when=past&course=BOZP-Z')
      await loaded(page)
      await expect(page.getByText('Course: BOZP – základní školení')).toBeVisible()
      await shot(page, 'sessions-past-course')
    })

    test('a list sorted and paged by the server, and a proposed session with its person', async ({
      page,
    }) => {
      await page.goto('/employees?sort=name&dir=desc&page=2')
      await loaded(page)
      await shot(page, 'employees-page-2')
      // The breakdown's proposed session opens with the person chosen in its booking form.
      await page.goto('/advisor')
      await loaded(page)
      await page.locator('tbody a[href*="?employee="]').first().click()
      await expect(page).toHaveURL(/\/sessions\/T\d+\?employee=E\d+$/)
      await loaded(page)
      await shot(page, 'session-person-chosen')
    })

    test('the import, step by step, nothing imported', async ({ page }) => {
      await page.goto('/import')
      await loaded(page)
      const data = path.join(import.meta.dirname, '../../../data')
      await page
        .locator('input[type=file]')
        .setInputFiles(
          ['katalog_skoleni.csv', 'zamestnanci.csv', 'terminy_skoleni.csv'].map(f =>
            path.join(data, f)
          )
        )
      await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(3)
      await shot(page, 'import-files')
      await page.getByRole('button', { name: 'Review rows' }).click()
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
      await shot(page, 'import-review', false)
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible()
      await shot(page, 'import-confirm')
    })

    test('forms with fields at odds, and nothing changed by itself', async ({ page }) => {
      await page.goto('/sessions/T016/edit')
      await loaded(page)
      await page.getByRole('combobox', { name: /Room/ }).click()
      await page.getByRole('option', { name: /^Seminární místnost/ }).click()
      await expect(page.getByRole('textbox', { name: /Capacity/ })).toHaveValue('30')
      await shot(page, 'form-session-room-too-small')
      await page.goto('/employees/E0153/edit')
      await loaded(page)
      await page.getByRole('combobox', { name: 'Department' }).click()
      await page.getByRole('option', { name: 'Laboratoře' }).click()
      await expect(page.getByRole('combobox', { name: 'Position' })).toHaveText(/Specialista/)
      await shot(page, 'form-employee-position-elsewhere')
    })

    test('the theme and language switches, hovered', async ({ page }) => {
      await page.goto('/')
      await loaded(page)
      // The one not chosen in this theme: its hover fill against the bar.
      const other = page
        .getByRole('radiogroup', { name: 'Colour theme' })
        .locator('[role="radio"][aria-checked="false"]')
        .first()
      await expect(other).toBeVisible()
      await other.hover()
      await shot(page, 'switch-hover', false)
    })

    test('a link and the row actions, hovered', async ({ page }) => {
      await page.goto('/employees')
      await loaded(page)
      await page.locator('tbody a[href^="/employees/E"]').first().hover()
      await shot(page, 'link-hover', false)
      await page
        .getByRole('main')
        .getByRole('button', { name: /^Archive / })
        .first()
        .hover()
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible()
      await shot(page, 'row-action-hover', false)
    })

    test('a session opened, and a failure toast', async ({ page }) => {
      await page.goto('/sessions')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Who is booked on / })
        .first()
        .click()
      await shot(page, 'sessions-row-open', false)
      // A booking that cannot reach the server: nothing is written, a toast says so.
      await page.goto('/advisor?view=action')
      await loaded(page)
      await page.locator('tbody a[href*="?employee="]').first().click()
      await expect(page).toHaveURL(/\?employee=/)
      await loaded(page)
      await page.route('**/sessions/**', route =>
        route.request().method() === 'POST' ? route.abort() : route.continue()
      )
      await page.getByRole('button', { name: 'Book', exact: true }).click()
      await expect(
        page.getByText('That did not go through. Check the page and try again.', {
          exact: true,
        })
      ).toBeVisible()
      await shot(page, 'toast-failure', false)
    })
  })
}
