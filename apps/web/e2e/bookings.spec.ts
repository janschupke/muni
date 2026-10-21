import type { Page } from '@playwright/test'

import { save } from './support/pages'
import { seededCzech } from './support/register'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// What an admin does with sessions and bookings, in a real browser: plan a session through
// the time picker, book people from every place that offers it, cancel and reinstate. The
// spec has a server and a database of its own (playwright.config.ts), seeded afresh each
// run; its tests run in order.

test.use({ storageState: storageState('admin') })

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

test('plans a session with the time picker, books a person, cancels, reinstates and archives it', async ({
  page,
}) => {
  await page.goto('/sessions/new')
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^GDPR/ }).click()
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill(seededCzech('2027-03-15'))
  await date.blur()
  // Start from the lists: hour, then minute.
  await page.getByRole('button', { name: 'Choose Start from a list' }).click()
  await page.getByRole('listbox', { name: 'Hours' }).getByRole('option', { name: '07' }).click()
  await page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '30' }).click()
  await expect(page.getByRole('textbox', { name: /^Start/ })).toHaveValue('07:30')
  // The end follows the course's length (GDPR: two hours); the provider brings the price.
  await expect(page.getByRole('status', { name: /^End/ })).toHaveText('09:30')
  await page.getByRole('combobox', { name: /Provider/ }).click()
  await page.getByRole('option', { name: /^Interní školitel/ }).click()
  await page.getByRole('combobox', { name: /Room/ }).click()
  await page.getByRole('option', { name: 'Online' }).click()
  await page.getByRole('textbox', { name: /^Seats/ }).fill('5')
  await save(page).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)

  // Offered: the people who need GDPR, each with why.
  await page.getByRole('combobox', { name: 'Person to book' }).click()
  const option = page.getByRole('option').first()
  const label = (await option.textContent()) ?? ''
  const name = label.split(' · ')[0] ?? ''
  await option.click()
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  const booked = page.getByRole('main').getByRole('link', { name, exact: true })
  await expect(booked).toBeVisible()
  await expect(page.getByText(`Booked: ${label}`, { exact: true })).toBeVisible()

  // Still to start, it is cancelled, not archived: its people stay listed, and need a session.
  const main = page.getByRole('main')
  await expect(main.getByRole('button', { name: 'Archive' })).toHaveCount(0)
  await main.getByRole('button', { name: 'Cancel session…' }).click()
  const cancel = page.getByRole('dialog', { name: /^Cancel S\d{3} · .+\?$/ })
  await expect(cancel.getByText(/The 1 person booked stays listed on it/)).toBeVisible()
  await cancel.getByRole('button', { name: 'Cancel session', exact: true }).click()
  await expect(page.getByText(/^Session cancelled: S\d{3}/)).toBeVisible()
  await expect(main.getByText('Cancelled', { exact: true })).toBeVisible()
  await expect(booked).toBeVisible()
  // Planned again: its room and its person are still free then.
  await main.getByRole('button', { name: 'Reinstate…' }).click()
  await page
    .getByRole('dialog', { name: /^Plan S\d{3} · .+ again\?$/ })
    .getByRole('button', { name: 'Reinstate', exact: true })
    .click()
  await expect(page.getByText(/^Session planned again: S\d{3}/)).toBeVisible()
  await expect(main.getByRole('button', { name: 'Cancel session…' })).toBeVisible()

  await page.getByRole('button', { name: `Cancel the booking of ${name}` }).click()
  await page
    .getByRole('dialog', { name: `Remove ${name} from this session?` })
    .getByRole('button', { name: 'Cancel booking' })
    .click()
  await expect(booked).toHaveCount(0)
  await expect(page.getByText('Booking cancelled', { exact: true })).toBeVisible()
  // The row and its button went; focus stayed in the page, not on the body.
  await expect(page.locator('body')).not.toBeFocused()

  // Cancelled, it can be archived, and leaves for the list.
  await main.getByRole('button', { name: 'Cancel session…' }).click()
  await page
    .getByRole('dialog', { name: /^Cancel S\d{3}/ })
    .getByRole('button', { name: 'Cancel session', exact: true })
    .click()
  await main.getByRole('button', { name: 'Archive' }).click()
  const archive = page.getByRole('dialog', { name: /^Archive S\d{3}/ })
  await archive.getByRole('button', { name: 'Archive', exact: true }).click()
  await expect(page).toHaveURL(/\/sessions$/)
})

test('a training that cannot be booked keeps its Book… in place and says why', async ({ page }) => {
  await page.goto('/employees?status=PARENTAL_LEAVE')
  const book = page.getByRole('button', { name: /^Book every training .+ needs…$/ }).first()
  await expect(book).toHaveAttribute('aria-disabled', 'true')
  await book.hover()
  await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(
    'On parental leave: nothing to book until they are back'
  )
  // Pressing it opens nothing. (Playwright waits forever to click what is aria-disabled, so
  // it is pressed from the keyboard, where it still takes focus.)
  await book.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('checks a session’s room and seats as they are typed, and changes its course', async ({
  page,
}) => {
  await page.goto('/sessions/new')
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^BOZP-Z/ }).click()
  await page.getByRole('combobox', { name: /Provider/ }).click()
  await page.getByRole('option', { name: /^Interní školitel/ }).click()
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill(seededCzech('2027-04-12'))
  await date.blur()
  // A room never changes the seats: they are the user's to type.
  await page.getByRole('combobox', { name: /Room/ }).click()
  await page.getByRole('option', { name: /^Aula A · 40 seats/ }).click()
  const seats = page.getByRole('textbox', { name: /^Seats/ })
  await expect(seats).toHaveValue('')
  await seats.fill('30')
  // A room too small marks both fields, before anything is sent, and keeps the seats.
  await page.getByRole('combobox', { name: /Room/ }).click()
  await page.getByRole('option', { name: /^Učebna 2 · 15 seats/ }).click()
  await expect(seats).toHaveValue('30')
  await expect(page.getByText('Učebna 2 holds 15; this session opens 30.')).toHaveCount(2)
  await expect(seats).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByRole('combobox', { name: /Room/ })).toHaveAttribute('aria-invalid', 'true')
  await page.getByRole('combobox', { name: /Room/ }).click()
  await expect(
    page.getByRole('option', { name: /^Seminární místnost · 12 seats · too small/ })
  ).toBeVisible()
  await page.getByRole('option', { name: /^Učebna 1 · 40 seats/ }).click()
  await expect(page.getByText(/this session opens/)).toHaveCount(0)
  await expect(seats).toHaveValue('30')
  await save(page).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)

  // Another course, on the edit form.
  await page.getByRole('main').getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^GDPR/ }).click()
  await save(page).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)
  await expect(
    page
      .getByRole('main')
      .getByText(/Ochrana osobních údajů/)
      .first()
  ).toBeVisible()
})

test('reviews a planner offer, checks it, then creates the session with its people booked', async ({
  page,
}) => {
  await page.goto('/planner')
  await page
    .getByRole('button', { name: /^Review session 1 of / })
    .first()
    .click()
  const dialog = page.getByRole('dialog', { name: /^New session: / })
  await expect(dialog).toBeVisible()
  // The provider is proposed with its price; the end follows the course's length.
  await expect(dialog.getByRole('combobox', { name: /Provider/ })).toContainText('Interní školitel')
  await dialog.getByRole('button', { name: 'Check' }).click()
  await expect(dialog.getByText('What will be created')).toBeVisible()
  await dialog.getByRole('button', { name: /^Create session and book / }).click()
  await expect(dialog).toHaveCount(0)
  const toast = page.getByText(/^Created S\d{3} and booked \d+ (person|people)$/)
  await expect(toast).toBeVisible()
  await page.getByRole('link', { name: 'Open session' }).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)
  await expect(page.getByRole('main').getByRole('link', { name: 'Interní školitel' })).toBeVisible()
})

/** The Book dialog, once it has read what it books. */
const bookDialog = async (page: Page) => {
  const dialog = page.getByRole('dialog', { name: 'Book trainings' })
  await expect(dialog.getByRole('status')).toHaveCount(0)
  return dialog
}

/** Confirms the dialog's bookings and waits for the toast. */
const confirmBooking = async (page: Page, dialog: ReturnType<Page['getByRole']>) => {
  await dialog.getByRole('button', { name: /^Book \d+ trainings? · / }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText(/^Booked \d+ trainings?$/)).toBeVisible()
}

test('books from either advisor tab the same way: a session chosen in the dialog', async ({
  page,
}) => {
  for (const view of ['action', 'breakdown']) {
    await page.goto(`/advisor?view=${view}`)
    const book = page.getByRole('button', { name: /^Book .+ for .+…$/ }).first()
    const name = ((await book.getAttribute('aria-label')) ?? '').replace(
      /^Book .+ for (.+)…$/,
      '$1'
    )
    await book.click()
    const dialog = await bookDialog(page)
    await expect(dialog.getByRole('cell', { name })).toBeVisible()
    // The proposal, or one of the others it could take.
    const choice = dialog.getByRole('combobox', { name: `Session for ${name}` })
    await choice.click()
    const options = page.getByRole('option')
    await options.nth((await options.count()) > 1 ? 1 : 0).click()
    await confirmBooking(page, dialog)
  }
})

test('books what a person needs from their requirement row, on their page', async ({ page }) => {
  // A training the advisor has a session for: its person and course, from the action tab.
  await page.goto('/advisor?view=action')
  const row = page
    .getByRole('table', { name: 'Action required' })
    .getByRole('row')
    .filter({ has: page.getByRole('button', { name: /^Book / }) })
    .first()
  const course = (await row.locator('a[href^="/courses/"]').first().textContent()) ?? ''
  await row.locator('a[href^="/employees/"]').first().click()
  await expect(page).toHaveURL(/\/employees\/[^/?]+$/)
  // Its place under the name, linked.
  const header = page.getByRole('heading', { level: 1 }).locator('..')
  await expect(
    header.locator('a[href^="/departments/"], a[href^="/positions/"]').first()
  ).toBeVisible()
  // No list of every session there is: booking starts from a training the person needs.
  await expect(page.getByRole('combobox', { name: 'Session to book on' })).toHaveCount(0)
  await page.getByRole('button', { name: new RegExp(`^Book ${escape(course)} for `) }).click()
  await confirmBooking(page, await bookDialog(page))
})

test('offers booking on a department’s people and in a compliance cell', async ({ page }) => {
  // The department with the most people needing action; its people come most urgent first.
  await page.goto('/departments?sort=actionNow&dir=desc')
  const department = page.locator('tbody tr').first().locator('a[href^="/departments/"]').first()
  const name = (await department.textContent()) ?? ''
  await department.click()
  await page
    .getByRole('button', { name: /^Book every training .+ needs…$/ })
    .first()
    .click()
  await expect((await bookDialog(page)).getByRole('combobox').first()).toBeVisible()
  await page.keyboard.press('Escape')

  // Its row in the matrix: a course it does not fully hold opens the people to book.
  await page.goto('/compliance')
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('link', { name, exact: true }) })
    .getByRole('button', { name: /: (?!100\s?%)\d+\s?%, show people$/ })
    .first()
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /^Book / })
    .first()
    .click()
  await expect((await bookDialog(page)).getByRole('combobox').first()).toBeVisible()
  await page.keyboard.press('Escape')
})

test('lists a department’s upcoming bookings behind its count', async ({ page }) => {
  // One booking at least, whatever the tests before left.
  await page.goto('/advisor?view=action')
  await page
    .getByRole('button', { name: /^Book .+ for .+…$/ })
    .first()
    .click()
  await confirmBooking(page, await bookDialog(page))
  await page.goto('/departments')
  const link = page.getByRole('link', { name: /upcoming bookings? of / }).first()
  const count = Number(((await link.textContent()) ?? '').replace(/\D/g, ''))
  await link.click()
  await expect(page).toHaveURL(/\/departments\/[^/]+\/bookings$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Upcoming bookings' })).toBeVisible()
  const rows = page.locator('[data-paging="server"] tbody tr')
  await expect(rows).toHaveCount(Math.min(count, 25))
})

test('offers on a session’s page only the people who need its course', async ({ page }) => {
  await page.goto('/advisor?view=action')
  await page
    .getByRole('table', { name: 'Action required' })
    .locator('a[href^="/sessions/T"]')
    .first()
    .click()
  await expect(page).toHaveURL(/\?employee=/)
  const person = page.getByRole('combobox', { name: 'Person to book' })
  // Started with the person the advisor proposed it for.
  await expect(person).toHaveText(/ · /)
  await person.click()
  for (const option of await page.getByRole('option').all())
    await expect(option).toHaveText(/ · (expired .+|expires .+|never held)$/)
  await page.keyboard.press('Escape')
})

test('books a person, and cancels the booking, from a session’s opened row in the list', async ({
  page,
}) => {
  await page.goto('/sessions?course=BOZP-Z')
  await page.getByRole('button', { name: 'Who is booked on T018' }).click()
  const person = page.getByRole('combobox', { name: 'Person to book' })
  await expect(person).toBeEnabled()
  await person.click()
  const option = page.getByRole('option').first()
  const name = ((await option.textContent()) ?? '').split(' · ')[0] ?? ''
  await option.click()
  await page.getByRole('button', { name: 'Book', exact: true }).click()
  await expect(page.getByText(new RegExp(`^Booked: ${name}`))).toBeVisible()
  const remove = page.getByRole('button', { name: `Cancel the booking of ${name}` })
  await expect(remove).toBeVisible()
  await remove.click()
  await page
    .getByRole('dialog', { name: `Remove ${name} from this session?` })
    .getByRole('button', { name: 'Cancel booking' })
    .click()
  await expect(remove).toHaveCount(0)
})
