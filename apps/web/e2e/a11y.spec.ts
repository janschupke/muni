import path from 'node:path'

import { setupClerkTestingToken } from '@clerk/testing/playwright'

import { expectNoViolations } from './support/a11y'
import { expectRowHover } from './support/contrast'
import { APP_PAGES, loaded, pathOf } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

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
      // The app's own sign-in and sign-up pages, around Clerk's form.
      for (const path of ['/sign-in', '/sign-up']) {
        await page.goto(path)
        await expect(page.locator('.cl-rootBox').first()).toBeVisible()
        // Clerk fades its form in whatever the motion setting: judge it once it has settled.
        await page.waitForFunction(() =>
          document.getAnimations().every(animation => animation.playState !== 'running')
        )
        // A development instance stripes Clerk's footer in orange under its words ("Secured
        // by", "Development mode"); a production instance has neither the stripes nor the
        // notice, and the app's appearance sets that text's colour. The dev footer is Clerk's.
        const devInstance = (await page.locator('[data-clerk-dev-mode-notice]').count()) > 0
        await expectNoViolations(page, path, undefined, devInstance ? ['.cl-footer'] : [])
      }
      await context.close()
    })

    for (const entry of APP_PAGES) {
      test(`${entry.name} page`, async ({ page }) => {
        const path = await pathOf(entry, async url => {
          await page.goto(url)
          await loaded(page)
          return page.content()
        })
        await page.goto(path)
        await loaded(page)
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
        await expectNoViolations(page, path)
        await expectRowHover(page, path)
      })
    }

    test('compliance matrix with a department open and a cell’s people shown', async ({ page }) => {
      await page.goto('/compliance')
      await page.getByRole('button', { name: 'People in Laboratoře' }).click()
      await expect(page.getByRole('list', { name: 'In the people rows:' })).toBeVisible()
      await expectNoViolations(page, 'expanded row')
      await expectRowHover(page, 'expanded row')
      // The people's cells are one stop for Tab: the arrows move between them, and each
      // shows its words as it takes the focus.
      const toggle = page.getByRole('button', { name: 'People in Laboratoře' })
      const firstRow = page.locator(
        `[id="${(await toggle.getAttribute('aria-controls'))?.split(' ')[0] ?? ''}"]`
      )
      await firstRow.getByRole('link').focus()
      await page.keyboard.press('Tab')
      await expect(firstRow.getByRole('button').first()).toBeFocused()
      await expect(page.locator('[data-radix-popper-content-wrapper]')).toBeVisible()
      await expectNoViolations(page, 'focused person cell')
      await page.keyboard.press('ArrowRight')
      await expect(firstRow.getByRole('button').nth(1)).toBeFocused()
      await page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'cell dialog')
    })

    test('departments and positions with a row open to its people', async ({ page }) => {
      await page.goto('/departments')
      await page.getByRole('button', { name: 'People in Laboratoře' }).click()
      await expect(page.getByRole('table', { name: 'People of Laboratoře' })).toBeVisible()
      // The people's bars sit in the opened row: their tracks must show there too.
      await expect(page.getByRole('meter').first()).toBeVisible()
      await expectNoViolations(page, 'department people')
      await page.goto('/positions')
      await page
        .getByRole('button', { name: /^People with the position / })
        .first()
        .click()
      await expect(page.getByRole('table', { name: /^People of / })).toBeVisible()
      await expectNoViolations(page, 'position people')
    })

    test('your own user page, with the role nobody may change for themselves', async ({ page }) => {
      await page.goto('/users')
      await loaded(page)
      await page.getByRole('link', { name: 'E2E Admin' }).first().click()
      await loaded(page)
      await expect(page.getByRole('combobox').first()).toBeDisabled()
      await expectNoViolations(page, 'own user')
    })

    test('the dialogs that ask before booking, resolving and creating', async ({ page }) => {
      await page.goto('/advisor?view=action')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Book .+…$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible()
      await expectNoViolations(page, 'advisor book dialog', '[role="dialog"]')
      await page.keyboard.press('Escape')

      // The same dialog opened from a person's list, reading what it books.
      await page.goto('/employees')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Book every training .+ needs…$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible()
      await expectNoViolations(page, 'person book dialog', '[role="dialog"]')
      await page.keyboard.press('Escape')

      // A compliance cell's people, with the way to book them.
      await page.goto('/compliance')
      await loaded(page)
      await page
        .getByRole('button', { name: /: (?!100%)\d+%, show people$/ })
        .first()
        .click()
      await expect(
        page
          .getByRole('dialog')
          .getByRole('button', { name: /^Book / })
          .first()
      ).toBeVisible()
      await expectNoViolations(page, 'compliance cell with booking', '[role="dialog"]')
      await page.keyboard.press('Escape')

      // Archiving asks first, saying what it does, and is left unconfirmed here.
      await page.goto('/rooms')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Archive / })
        .first()
        .click()
      const archive = page.getByRole('dialog')
      await expect(archive.getByRole('button', { name: 'Archive', exact: true })).toBeEnabled()
      await expect(archive.getByText(/^It leaves every list and count/)).toBeVisible()
      await expectNoViolations(page, 'archive dialog', '[role="dialog"]')
      await page.keyboard.press('Escape')

      await page.goto('/advisor?view=overbooked')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Resolve the overbooking of/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectNoViolations(page, 'resolve dialog', '[role="dialog"]')
      await page.keyboard.press('Escape')

      await page.goto('/planner')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Review session 1 of / })
        .first()
        .click()
      const review = page.getByRole('dialog')
      await expect(review).toBeVisible()
      await expectNoViolations(page, 'planner review', '[role="dialog"]')
      // The check writes nothing.
      await review.getByRole('button', { name: 'Check' }).click()
      await expect(review.getByText('What will be created')).toBeVisible()
      await expectNoViolations(page, 'planner review summary', '[role="dialog"]')
    })

    test('a session row opened to its details and people', async ({ page }) => {
      await page.goto('/sessions')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Who is booked on / })
        .first()
        .click()
      await expect(page.getByRole('heading', { level: 2, name: /^Booked by name/ })).toBeVisible()
      await expectNoViolations(page, 'session opened')
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
      await expectNoViolations(page, 'import, files chosen')
      await page.getByRole('button', { name: 'Review rows' }).click()
      await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
      await expectNoViolations(page, 'import, review')
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible()
      await expectNoViolations(page, 'import, confirm')
    })

    test('links and icon buttons hovered and focused', async ({ page }) => {
      await page.goto('/employees')
      await loaded(page)
      // A hovered link, a focused one: still links, still legible.
      const name = page.locator('tbody a[href^="/employees/E"]').first()
      await name.hover()
      await expectNoViolations(page, 'link hovered')
      await name.focus()
      await expectNoViolations(page, 'link focused')
      // Each tone of icon button, hovered and focused: its soft fill under its ink.
      const main = page.getByRole('main')
      for (const [what, button] of [
        ['edit', main.getByRole('link', { name: /^Edit / }).first()],
        ['archive', main.getByRole('button', { name: /^Archive / }).first()],
      ] as const) {
        await button.hover()
        await expectNoViolations(page, `${what} hovered`)
        await button.focus()
        await expectNoViolations(page, `${what} focused`)
      }
    })

    test('forms with fields at odds, every one marked', async ({ page }) => {
      await page.goto('/sessions/T016/edit')
      await loaded(page)
      await page.getByRole('combobox', { name: /Room/ }).click()
      await page.getByRole('option', { name: /^Seminární místnost/ }).click()
      await expect(page.getByRole('combobox', { name: /Room/ })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
      await expectNoViolations(page, 'session, room too small')
      await page.goto('/employees/E0153/edit')
      await loaded(page)
      await page.getByRole('combobox', { name: 'Department' }).click()
      await page.getByRole('option', { name: 'Laboratoře' }).click()
      await expect(page.getByRole('combobox', { name: 'Position' })).toHaveAttribute(
        'aria-invalid',
        'true'
      )
      await expectNoViolations(page, 'employee, position outside the department')
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
