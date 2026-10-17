import type { Page } from '@playwright/test'

import { expectNoViolations } from './support/a11y'
import { removeE2eRecords } from './support/db'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// What an admin does with records, in a real browser: create, edit, archive and bring back,
// book by hand, and fill dates and times through the pickers. Everything created here is
// removed again (the app only archives, so the spec deletes its own rows).

test.use({ storageState: storageState('admin') })

test.beforeAll(removeE2eRecords)

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
})

test.afterAll(removeE2eRecords)

/** The form's own submit button, on its heading row ("Create department", "Save changes"). */
const save = (page: Page) => page.getByRole('main').locator('form button[type="submit"]')

test('creates, renames, archives and brings back a department', async ({ page }) => {
  await page.goto('/departments')
  await page.getByRole('link', { name: 'New department' }).click()
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E útvar')
  await save(page).click()
  // Created from the list, back to the list, with the new row in it.
  await expect(page).toHaveURL(/\/departments$/)
  await page.getByRole('main').getByRole('link', { name: 'E2E útvar', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E útvar' })).toBeVisible()

  await page.getByRole('main').getByRole('link', { name: 'Edit' }).click()
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E útvar 2')
  await save(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E útvar 2' })).toBeVisible()

  await page.getByRole('main').getByRole('button', { name: 'Archive' }).click()
  const confirm = page.getByRole('dialog', { name: 'Archive E2E útvar 2?' })
  await confirm.getByRole('button', { name: 'Archive' }).click()
  await expect(page).toHaveURL(/\/departments$/)
  await expect(page.getByRole('link', { name: 'E2E útvar 2' })).toHaveCount(0)

  // The name is free again: a new department takes it, and the archived one cannot come back.
  await page.getByRole('link', { name: 'New department' }).click()
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E útvar 2')
  await save(page).click()
  await expect(page).toHaveURL(/\/departments$/)
  await expect(
    page.getByRole('main').getByRole('link', { name: 'E2E útvar 2', exact: true })
  ).toBeVisible()
  await page.goto('/departments/archived')
  await page.getByRole('main').getByRole('link', { name: 'E2E útvar 2', exact: true }).click()
  // On the record's own page: the list's row has a "Bring back E2E útvar 2" button too.
  await expect(page).toHaveURL(/\/departments\/archived\/[^/]+$/)
  // The seed archives nothing: this is where an archived record's page is checked.
  await expectNoViolations(page, 'archived department')
  await page.getByRole('button', { name: 'Bring back', exact: true }).click()
  // It asks first, then says why it cannot.
  await page
    .getByRole('dialog', { name: 'Bring back E2E útvar 2?' })
    .getByRole('button', { name: 'Bring back' })
    .click()
  await expect(
    page.getByText('An active record now uses its name. Rename or archive that one first.')
  ).toBeVisible()
})

test('adds a person with typed and picked dates, then archives them', async ({ page }) => {
  // Opened directly: saved, the form goes on to the new person.
  await page.goto('/employees/new')
  await page.getByRole('textbox', { name: /First name/ }).fill('Eva')
  await page.getByRole('textbox', { name: /Last name/ }).fill('E2E Testová')
  await page.getByRole('combobox', { name: 'Department' }).click()
  await page.getByRole('option', { name: 'Laboratoře' }).click()
  const hired = page.getByRole('textbox', { name: /Hired/ })
  await hired.fill('2.3.2026')
  await hired.blur()
  await expect(hired).toHaveValue('02.03.2026')
  // Left: from the calendar, by keyboard, a week after the 1st of the month it opens on.
  await page.getByRole('button', { name: 'Choose Left from a calendar' }).click()
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(grid).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Left' })).not.toHaveValue('')
  // Leaving is a date, not a status: the employment choice has no "Left".
  await page.getByRole('combobox', { name: /Employment/ }).click()
  await expect(page.getByRole('option', { name: 'Left', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: 'Active', exact: true }).click()
  // Saved with an N ID, which imports never overwrite.
  await save(page).click()
  await expect(page).toHaveURL(/\/employees\/N\d{4}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Eva E2E Testová' })).toBeVisible()
  await expect(page.getByText('02.03.2026')).toBeVisible()

  await page.getByRole('main').getByRole('button', { name: 'Archive' }).click()
  await page
    .getByRole('dialog', { name: 'Archive Eva E2E Testová?' })
    .getByRole('button', { name: 'Archive' })
    .click()
  await expect(page).toHaveURL(/\/employees$/)
  await page.getByRole('link', { name: 'Archived' }).click()
  // Listed by tag only, even to an admin; their own page says who it was.
  await expect(page.getByRole('main').getByText('Eva E2E Testová')).toHaveCount(0)
  await page
    .getByRole('link', { name: /^Archived employee #[0-9a-f]{6}$/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: /E2E Testová/ })).toBeVisible()
})

test('plans a session with the time picker, books a person by hand, and cancels it', async ({
  page,
}) => {
  await page.goto('/sessions/new')
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^GDPR/ }).click()
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill('15.03.2027')
  await date.blur()
  // Start from the lists: hour, then minute.
  await page.getByRole('button', { name: 'Choose Start from a list' }).click()
  await page.getByRole('listbox', { name: 'Hours' }).getByRole('option', { name: '07' }).click()
  await page.getByRole('listbox', { name: 'Minutes' }).getByRole('option', { name: '30' }).click()
  await expect(page.getByRole('textbox', { name: /^Start/ })).toHaveValue('07:30')
  const end = page.getByRole('textbox', { name: /^End/ })
  await end.fill('930')
  await end.blur()
  await expect(end).toHaveValue('09:30')
  await page.getByRole('combobox', { name: /Room/ }).click()
  await page.getByRole('option', { name: 'Online' }).click()
  await page.getByRole('textbox', { name: /Capacity/ }).fill('5')
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

  // Booked, it cannot be archived; the dialog says why.
  await page.getByRole('main').getByRole('button', { name: 'Archive' }).click()
  const refusal = page.getByRole('dialog', { name: /^Archive S\d{3}/ })
  await expect(
    refusal.getByText('1 seat is taken on this session.', { exact: false })
  ).toBeVisible()
  await refusal.getByRole('button', { name: 'Keep as is' }).click()

  await page.getByRole('button', { name: `Cancel the booking of ${name}` }).click()
  await page
    .getByRole('dialog', { name: `Remove ${name} from this session?` })
    .getByRole('button', { name: 'Cancel booking' })
    .click()
  await expect(booked).toHaveCount(0)
  await expect(page.getByText('Booking cancelled', { exact: true })).toBeVisible()
  // The row and its button went; focus stayed in the page, not on the body.
  await expect.poll(() => page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY')
})

test('a form goes back where it was opened from, filters included', async ({ page }) => {
  // Opened directly, a new person's form goes on to the person.
  await page.goto('/employees/new')
  await page.getByRole('textbox', { name: /First name/ }).fill('Jan')
  await page.getByRole('textbox', { name: /Last name/ }).fill('E2E Návrat')
  await save(page).click()
  await expect(page).toHaveURL(/\/employees\/N\d{4}$/)
  const record = new URL(page.url()).pathname

  // From a filtered list: saved, back to that list as it was.
  await page.goto('/employees?q=E2E+N%C3%A1vrat')
  await page.getByRole('link', { name: 'Edit E2E Návrat Jan' }).click()
  await expect(page).toHaveURL(`${record}/edit`)
  await page.getByRole('textbox', { name: /Note/ }).fill('Vrací se na seznam.')
  await save(page).click()
  await expect(page).toHaveURL(/\/employees\?q=E2E\+N%C3%A1vrat$/)
  const name = page.getByRole('link', { name: 'E2E Návrat Jan', exact: true })
  await expect(name).toBeVisible()

  // From the person's page: cancelled, back to it.
  await name.click()
  await expect(page).toHaveURL(record)
  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('main').getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(record)

  // Opened directly, a cancel goes to the person too.
  await page.goto(`${record}/edit`)
  await page.getByRole('main').getByRole('link', { name: 'Cancel' }).click()
  await expect(page).toHaveURL(record)
})

test('gives a position its departments and a department its head', async ({ page }) => {
  await page.goto('/departments/new')
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E vedení')
  await save(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E vedení' })).toBeVisible()

  await page.goto('/positions/new')
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E pozice')
  await page.getByRole('checkbox', { name: 'E2E vedení' }).click()
  await save(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E pozice' })).toBeVisible()

  // A person in the department: only its positions are offered, and they may lead it.
  await page.goto('/employees/new')
  await page.getByRole('textbox', { name: /First name/ }).fill('Jan')
  await page.getByRole('textbox', { name: /Last name/ }).fill('E2E Vedoucí')
  await page.getByRole('combobox', { name: 'Department' }).click()
  await page.getByRole('option', { name: 'E2E vedení' }).click()
  await page.getByRole('combobox', { name: 'Position' }).click()
  await expect(page.getByRole('option')).toHaveText(['—', 'E2E pozice'])
  await page.getByRole('option', { name: 'E2E pozice' }).click()
  await page.getByRole('checkbox', { name: 'Leads the department' }).click()
  await save(page).click()
  await expect(page).toHaveURL(/\/employees\/N\d{4}$/)

  await page.goto('/departments')
  await page.getByRole('main').getByRole('link', { name: 'E2E vedení', exact: true }).click()
  await expect(page.getByRole('main').getByText('E2E Vedoucí Jan').first()).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Head' })).toHaveText('E2E Vedoucí Jan')
  // Nobody leads it, by choice.
  await page.getByRole('combobox', { name: 'Head' }).click()
  await page.getByRole('option', { name: '—' }).click()
  await save(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E vedení' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Head' })).toHaveText('—')
})

test('checks a session’s room and seats as they are typed, and changes its course', async ({
  page,
}) => {
  await page.goto('/sessions/new')
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^BOZP-Z/ }).click()
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill('12.04.2027')
  await date.blur()
  // A room never changes the seats: they are the user's to type.
  await page.getByRole('combobox', { name: /Room/ }).click()
  await page.getByRole('option', { name: /^Aula A · 40 seats/ }).click()
  const seats = page.getByRole('textbox', { name: /Capacity/ })
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
  await dialog.getByRole('textbox', { name: /Price per person/ }).fill('450')
  await dialog.getByRole('button', { name: 'Check' }).click()
  await expect(dialog.getByText('What will be created')).toBeVisible()
  await dialog.getByRole('button', { name: /^Create session and book / }).click()
  await expect(dialog).toHaveCount(0)
  const toast = page.getByText(/^Created S\d{3} and booked \d+ (person|people)$/)
  await expect(toast).toBeVisible()
  await page.getByRole('link', { name: 'Open session' }).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)
  await expect(page.getByText('450,00 Kč').first()).toBeVisible()
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

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
