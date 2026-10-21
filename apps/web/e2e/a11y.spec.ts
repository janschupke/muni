import path from 'node:path'

import { expectAccessible } from './support/a11y'
import { APP_PAGES, loaded, pathOf } from './support/pages'
import { clerkLoaded, expect, test } from './support/test'
import { storageState } from './support/users'

// Contrast is judged on the settled page: with motion reduced, the page fade-in is instant.
// An admin sees every page and every control.
test.use({ reducedMotion: 'reduce', storageState: storageState('admin') })

// Every state is judged in both themes, switched in place (expectAccessible): each page and
// state is loaded once.
test.describe('accessibility', () => {
  test.describe('signed out', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('the introduction, and the sign-in and sign-up pages', async ({ page }) => {
      await page.goto('/')
      await expect(page.getByRole('link', { name: 'Create account' })).toBeVisible()
      await expectAccessible(page, 'introduction')
      // The app's own sign-in and sign-up pages, around Clerk's form.
      for (const path of ['/sign-in', '/sign-up']) {
        await page.goto(path)
        await clerkLoaded(page)
        await expect(page.locator('.cl-rootBox').first()).toBeVisible()
        // Clerk fades its form in whatever the motion setting: judge it once it has settled.
        await page.waitForFunction(() =>
          document.getAnimations().every(animation => animation.playState !== 'running')
        )
        // A development instance stripes Clerk's footer in orange under its words ("Secured
        // by", "Development mode"); a production instance has neither the stripes nor the
        // notice, and the app's appearance sets that text's colour. The dev footer is Clerk's.
        const devInstance = (await page.locator('[data-clerk-dev-mode-notice]').count()) > 0
        await expectAccessible(page, path, { exclude: devInstance ? ['.cl-footer'] : [] })
      }
    })
  })

  for (const entry of APP_PAGES) {
    test(`${entry.name} page`, async ({ page }) => {
      const path = await pathOf(entry)
      await page.goto(path)
      await loaded(page)
      await expectAccessible(page, path, { rowHover: true })
    })
  }

  test('compliance matrix with a department open', async ({ page }) => {
    await page.goto('/compliance')
    await page.getByRole('button', { name: 'People in Laboratoře' }).click()
    await expect(page.getByRole('list', { name: 'In the people rows:' })).toBeVisible()
    await expectAccessible(page, 'expanded row', { rowHover: true })
  })

  test('compliance matrix: a person’s cells, focused, and a cell’s dialog', async ({ page }) => {
    await page.goto('/compliance')
    await page.getByRole('button', { name: 'People in Laboratoře' }).click()
    await expect(page.getByRole('list', { name: 'In the people rows:' })).toBeVisible()
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
    await expectAccessible(page, 'focused person cell')
    await page.keyboard.press('ArrowRight')
    await expect(firstRow.getByRole('button').nth(1)).toBeFocused()
    await page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAccessible(page, 'cell dialog')
  })

  test('departments and positions with a row open to its people', async ({ page }) => {
    await page.goto('/departments')
    await page.getByRole('button', { name: 'People in Laboratoře' }).click()
    await expect(page.getByRole('table', { name: 'People of Laboratoře' })).toBeVisible()
    // The people's bars sit in the opened row: their tracks must show there too.
    await expect(page.getByRole('meter').first()).toBeVisible()
    await expectAccessible(page, 'department people')
    await page.goto('/positions')
    await page
      .getByRole('button', { name: /^People with the position / })
      .first()
      .click()
    await expect(page.getByRole('table', { name: /^People of / })).toBeVisible()
    await expectAccessible(page, 'position people')
  })

  test('your own user page, with the role nobody may change for themselves', async ({ page }) => {
    await page.goto('/users')
    await loaded(page)
    await page.getByRole('link', { name: 'E2E Admin' }).first().click()
    await loaded(page)
    await expect(page.getByRole('combobox').first()).toBeDisabled()
    await expectAccessible(page, 'own user')
  })

  test.describe('the dialogs that ask before booking, resolving and creating', () => {
    test('the advisor’s Book dialog', async ({ page }) => {
      await page.goto('/advisor?view=action')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Book .+ for .+…$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible()
      await expectAccessible(page, 'advisor book dialog', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('the Book dialog opened from a person’s list', async ({ page }) => {
      // The same dialog opened from a person's list, reading what it books.
      await page.goto('/employees')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Book every training .+ needs…$/ })
        .first()
        .click()
      await expect(page.getByRole('dialog').getByRole('combobox').first()).toBeVisible()
      await expectAccessible(page, 'person book dialog', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('a compliance cell’s people, with the way to book them', async ({ page }) => {
      // A compliance cell's people, with the way to book them.
      await page.goto('/compliance')
      await loaded(page)
      await page
        .getByRole('button', { name: /: (?!100\s?%)\d+\s?%, show people$/ })
        .first()
        .click()
      await expect(
        page
          .getByRole('dialog')
          .getByRole('button', { name: /^Book / })
          .first()
      ).toBeVisible()
      // A hovered row with its Book button: the button still stands apart from the row.
      await page
        .getByRole('dialog')
        .getByRole('row')
        .filter({ has: page.getByRole('button', { name: /^Book / }) })
        .first()
        .hover({ position: { x: 4, y: 4 } })
      await expectAccessible(page, 'compliance cell with booking', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('the archive dialog, which asks first and says what it does', async ({ page }) => {
      // Archiving asks first, saying what it does, and is left unconfirmed here.
      await page.goto('/rooms')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Archive / })
        .first()
        .click()
      const archive = page.getByRole('dialog')
      // Checked first: the confirm says so until the server has answered.
      await expect(archive.getByRole('button', { name: /^Checking/ })).toHaveCount(0)
      await expect(archive.getByText(/^It leaves every list and count/)).toBeVisible()
      await expectAccessible(page, 'archive dialog', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('the dialog that asks before cancelling a session', async ({ page }) => {
      // Cancelling a session still to start asks first, saying what happens to its people.
      await page.goto('/sessions/T018')
      await loaded(page)
      await page.getByRole('main').getByRole('button', { name: 'Cancel session…' }).click()
      await expect(page.getByRole('dialog').getByText(/stay listed on it|by name/)).toBeVisible()
      await expectAccessible(page, 'cancel session dialog', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('a Book… that cannot book, saying why', async ({ page }) => {
      // A Book… that cannot book (a person on leave) stays in place, saying why.
      await page.goto('/employees?status=PARENTAL_LEAVE')
      await loaded(page)
      const unavailable = page
        .getByRole('button', { name: /^Book every training .+ needs…$/ })
        .first()
      await unavailable.hover()
      await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(
        'On parental leave: nothing to book until they are back'
      )
      await expectAccessible(page, 'unavailable book button')
    })

    test('the dialog that resolves an overbooking', async ({ page }) => {
      await page.goto('/advisor?view=overbooked')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Resolve the overbooking of/ })
        .first()
        .click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await expectAccessible(page, 'resolve dialog', { within: '[role="dialog"]' })
      await page.keyboard.press('Escape')
    })

    test('the planner’s review of an offer, and its check', async ({ page }) => {
      await page.goto('/planner')
      await loaded(page)
      await page
        .getByRole('button', { name: /^Review session 1 of / })
        .first()
        .click()
      const review = page.getByRole('dialog')
      await expect(review).toBeVisible()
      await expectAccessible(page, 'planner review', { within: '[role="dialog"]' })
      // The check writes nothing.
      await review.getByRole('button', { name: 'Check' }).click()
      await expect(review.getByText('What will be created')).toBeVisible()
      await expectAccessible(page, 'planner review summary', { within: '[role="dialog"]' })
    })
  })

  test('a session row opened to its details and people', async ({ page }) => {
    await page.goto('/sessions')
    await loaded(page)
    await page
      .getByRole('button', { name: /^Who is booked on / })
      .first()
      .click()
    await expect(page.getByRole('heading', { level: 2, name: /^Booked by name/ })).toBeVisible()
    await expectAccessible(page, 'session opened')
  })

  test('collapsed sidebar, and the navigation drawer on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/courses')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await expectAccessible(page, 'collapsed sidebar')
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expectAccessible(page, 'navigation drawer')
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
    await expectAccessible(page, 'import, files chosen')
    await page.getByRole('button', { name: 'Review rows' }).click()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expectAccessible(page, 'import, review')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible()
    await expectAccessible(page, 'import, confirm')
  })

  test('links and icon buttons hovered and focused', async ({ page }) => {
    await page.goto('/employees')
    await loaded(page)
    // The states are the first row's, and change only its paint (the page itself is judged
    // whole above): their colours, in both themes.
    const ROW = 'main table tbody tr:first-child'
    const row = page.locator(ROW)
    // A hovered link, a focused one: still links, still legible.
    const name = row.locator('a[href^="/employees/E"]').first()
    await name.hover()
    await expectAccessible(page, 'link hovered', { within: ROW, paintOnly: true })
    await name.focus()
    await expectAccessible(page, 'link focused', { within: ROW, paintOnly: true })
    // Each tone of icon button, hovered and focused: its soft fill under its ink.
    for (const [what, button] of [
      ['edit', row.getByRole('link', { name: /^Edit / }).first()],
      ['archive', row.getByRole('button', { name: /^Archive / }).first()],
    ] as const) {
      await button.hover()
      await expectAccessible(page, `${what} hovered`, { within: ROW, paintOnly: true })
      await button.focus()
      await expectAccessible(page, `${what} focused`, { within: ROW, paintOnly: true })
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
    await expectAccessible(page, 'session, room too small')
    await page.goto('/employees/E0153/edit')
    await loaded(page)
    await page.getByRole('combobox', { name: 'Department' }).click()
    await page.getByRole('option', { name: 'Laboratoře' }).click()
    await expect(page.getByRole('combobox', { name: 'Position' })).toHaveAttribute(
      'aria-invalid',
      'true'
    )
    await expectAccessible(page, 'employee, position outside the department')
  })

  test('employee list with a row open and a filter open', async ({ page }) => {
    await page.goto('/employees')
    await page
      .getByRole('button', { name: /^Details for / })
      .first()
      .click()
    await expect(page.getByRole('columnheader', { name: 'Valid until' })).toBeVisible()
    await expectAccessible(page, 'expanded employee')
    await page.getByRole('combobox', { name: 'Department' }).click()
    await expect(page.getByRole('listbox')).toBeVisible()
    // An open listbox hides the rest of the page from assistive tech (Radix), so only the
    // listbox itself is audited in this state.
    await expectAccessible(page, 'open select', { within: '[role="listbox"]' })
  })
})
