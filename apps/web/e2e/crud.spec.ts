import type { Page } from '@playwright/test'

import { expectAccessible } from './support/a11y'
import { save } from './support/pages'
import { seededCzech } from './support/register'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// What an admin does with records, in a real browser: create, edit, archive and bring back,
// and fill dates through the pickers. The spec has a server and a database of its own
// (playwright.config.ts), seeded afresh each run: what it creates shows up nowhere else.
// Booking is bookings.spec.ts's.

test.use({ storageState: storageState('admin') })

/** Picks an option from a select by its label. */
const pick = async (page: Page, label: string | RegExp, option: RegExp) => {
  await page.getByRole('combobox', { name: label }).click()
  await page.getByRole('option', { name: option }).click()
}

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
  await expectAccessible(page, 'archived department')
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

test('a provider offers courses at prices, holds sessions of them, and stops only when none is ahead', async ({
  page,
}) => {
  await page.goto('/providers/new')
  await page.getByRole('textbox', { name: 'Name' }).fill('E2E dodavatel')
  await page.getByRole('button', { name: 'Add a course' }).click()
  await pick(page, 'Course in row 1', /^GDPR/)
  await page.getByRole('textbox', { name: /^Price per person for GDPR/ }).fill('300')
  await page.getByRole('button', { name: 'Add a course' }).click()
  // A course already listed is not offered again.
  await page.getByRole('combobox', { name: 'Course in row 2' }).click()
  await expect(page.getByRole('option', { name: /^GDPR/ })).toHaveCount(0)
  await page.getByRole('option', { name: /^BOZP-Z/ }).click()
  await page.getByRole('textbox', { name: /^Price per person for BOZP-Z/ }).fill('400')
  await save(page).click()
  await expect(page).toHaveURL(/\/providers\/[^/]+$/)
  const offered = page.getByRole('table', { name: 'Courses E2E dodavatel offers' })
  await expect(offered.getByRole('row', { name: /Ochrana osobních údajů/ })).toContainText(
    /300,00\sKč/
  )

  // Scheduled from its offering: the course and the provider chosen, the price with them.
  await page
    .getByRole('link', {
      name: 'Schedule a session of Ochrana osobních údajů with E2E dodavatel',
    })
    .click()
  await expect(page.getByRole('combobox', { name: /Provider/ })).toContainText('E2E dodavatel')
  await expect(page.getByRole('status', { name: 'Price per person' })).toHaveText(/300,00/)
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill(seededCzech('2027-04-20'))
  await date.blur()
  await pick(page, /Room/, /^Online/)
  await page.getByRole('textbox', { name: /^Seats/ }).fill('5')
  await save(page).click()
  // Back where the form was opened: the provider, which now holds the session.
  await expect(page.getByRole('heading', { level: 1, name: 'E2E dodavatel' })).toBeVisible()
  const main = page.getByRole('main')
  await expect(
    offered
      .getByRole('row', { name: /Ochrana osobních údajů/ })
      .getByRole('cell', { name: '1', exact: true })
  ).toBeVisible()
  await main.getByRole('link', { name: seededCzech('2027-04-20') }).click()
  await expect(page).toHaveURL(/\/sessions\/S\d{3}$/)
  // Its provider among its facts (the way back names it too).
  const held = page.getByRole('definition').getByRole('link', { name: 'E2E dodavatel' })
  await expect(held).toBeVisible()

  // While that session is ahead, the course it uses stays offered, and the provider stays.
  await held.click()
  await expect(page.getByRole('heading', { level: 1, name: 'E2E dodavatel' })).toBeVisible()
  await main.getByRole('button', { name: 'Archive', exact: true }).click()
  const archive = page.getByRole('dialog', { name: /^Archive E2E dodavatel/ })
  await expect(archive.getByText(/It holds 1 session ahead\./)).toBeVisible()
  await archive.getByRole('button', { name: 'Keep as is' }).click()
  await main.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Remove GDPR · Ochrana osobních údajů' }).click()
  await save(page).click()
  await expect(
    page.getByText(/^Upcoming sessions of Ochrana osobních údajů are held by this provider \(1\)/)
  ).toBeVisible()
  // A new price is saved; the session keeps the one it was scheduled at.
  await page.goto(page.url())
  await page.getByRole('textbox', { name: /^Price per person for GDPR/ }).fill('350')
  await save(page).click()
  await expect(offered.getByRole('row', { name: /Ochrana osobních údajů/ })).toContainText(
    /350,00\sKč/
  )
  await expectAccessible(page, 'provider with offerings')
})

test('a course sets what its sessions are; one is scheduled from its row, by a provider that offers it', async ({
  page,
}) => {
  await page.goto('/courses/new')
  await page.getByRole('textbox', { name: /Code/ }).fill('e2e-kurz')
  await page.getByRole('textbox', { name: 'Name' }).fill('E2E kurz')
  await page.getByRole('textbox', { name: /^Length/ }).fill('90')
  await page.getByRole('textbox', { name: /^Seats/ }).fill('8')
  await save(page).click()
  await expect(page).toHaveURL(/\/courses\/E2E-KURZ$/)
  // Nobody offers it yet: scheduling stays in place, dimmed, and says why.
  const blocked = page.getByRole('main').getByRole('button', { name: 'Schedule session' })
  await expect(blocked).toHaveAttribute('aria-disabled', 'true')
  await blocked.hover()
  await expect(page.getByRole('tooltip', { includeHidden: true })).toHaveText(
    'No provider offers the course: add it to a provider’s offered courses first'
  )

  // The internal provider offers it now.
  await page.goto('/providers')
  await page.getByRole('link', { name: 'Interní školitel' }).first().click()
  await page.getByRole('main').getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('button', { name: 'Add a course' }).click()
  const rows = page.getByRole('group', { name: 'Offered courses' })
  const last = rows.getByRole('combobox', { name: /^Course in row/ }).last()
  await last.click()
  await page.getByRole('option', { name: /^E2E-KURZ/ }).click()
  await rows.getByRole('textbox', { name: /^Price per person for E2E-KURZ/ }).fill('0')
  await save(page).click()
  await expect(page).toHaveURL(/\/providers\/[^/]+$/)

  // From the course list's row: the form takes the course's length and seats.
  await page.goto('/courses')
  await page.getByRole('link', { name: 'Schedule a session of E2E kurz' }).click()
  await expect(page.getByRole('combobox', { name: /Course/ })).toContainText('E2E-KURZ')
  await expect(page.getByRole('combobox', { name: /Provider/ })).toContainText('Interní školitel')
  await expect(page.getByRole('status', { name: /^End/ })).toHaveText('10:30')
  const seats = page.getByRole('textbox', { name: /^Seats/ })
  await expect(seats).toHaveValue('8')
  // Its own seats, fewer than the course's.
  await seats.fill('6')
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill(seededCzech('2027-04-21'))
  await date.blur()
  await pick(page, /Room/, /^Učebna 1/)
  await save(page).click()
  // Back on the list it was scheduled from; the course has the session, with its own seats.
  await expect(page).toHaveURL(/\/courses$/)
  await page.goto('/courses/E2E-KURZ')
  const row = page.getByRole('row', { name: seededCzech('2027-04-21') })
  await expect(row).toContainText('Učebna 1')
  await expect(row).toContainText(/0 of 6/)
})

test('a room holds its seats (an online one none), and schedules a course that fits it', async ({
  page,
}) => {
  await page.goto('/rooms/new')
  await page.getByRole('textbox', { name: 'Name' }).fill('E2E místnost')
  // Online: no seats to set.
  await pick(page, /Kind/, /^Online/)
  await expect(page.getByRole('textbox', { name: /^Seats/ })).toHaveCount(0)
  await pick(page, /Kind/, /^Classroom/)
  await page.getByRole('textbox', { name: /^Seats/ }).fill('40')
  await page.getByRole('checkbox', { name: 'Projector' }).click()
  await save(page).click()
  await expect(page).toHaveURL(/\/rooms\/[^/]+$/)
  // Its course fit schedules a course here, the room chosen.
  await page
    .getByRole('link', { name: 'Schedule a session of BOZP – základní školení in E2E místnost' })
    .click()
  await expect(page.getByRole('combobox', { name: /Room/ })).toContainText('E2E místnost')
  await expect(page.getByRole('combobox', { name: /Course/ })).toContainText('BOZP-Z')
})

test('the default provider is not archived; making another the default moves it', async ({
  page,
}) => {
  await page.goto('/providers')
  await page.getByRole('link', { name: 'Interní školitel' }).first().click()
  const main = page.getByRole('main')
  await expect(main.getByText('Default for imported sessions that name no provider')).toBeVisible()
  await main.getByRole('button', { name: 'Archive', exact: true }).click()
  const archive = page.getByRole('dialog', { name: /^Archive Interní školitel/ })
  await expect(archive.getByText(/It is the default provider for imported sessions/)).toBeVisible()
  await archive.getByRole('button', { name: 'Keep as is' }).click()
  const internal = page.url()

  await page.goto('/providers/new')
  await page.getByRole('textbox', { name: 'Name' }).fill('E2E výchozí')
  await page.getByRole('checkbox', { name: 'Default for imported sessions' }).click()
  await save(page).click()
  await expect(main.getByText('Default for imported sessions that name no provider')).toBeVisible()
  await page.goto(internal)
  await expect(main.getByText('Default for imported sessions that name no provider')).toHaveCount(0)
  // Given back, as it was.
  await main.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.getByRole('checkbox', { name: 'Default for imported sessions' }).click()
  await save(page).click()
  await expect(main.getByText('Default for imported sessions that name no provider')).toBeVisible()
})
