import type { Page } from '@playwright/test'

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

/** The form's own Save, on its heading row. */
const save = (page: Page) => page.getByRole('main').getByRole('button', { name: 'Save' })

test('creates, renames, archives and brings back a department', async ({ page }) => {
  await page.goto('/departments')
  await page.getByRole('link', { name: 'New department' }).click()
  await page.getByRole('textbox', { name: /Name/ }).fill('E2E útvar')
  await save(page).click()
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
  await expect(page.getByRole('heading', { level: 1, name: 'E2E útvar 2' })).toBeVisible()
  await page.goto('/departments/archived')
  await page.getByRole('main').getByRole('link', { name: 'E2E útvar 2', exact: true }).click()
  await page.getByRole('button', { name: 'Bring back' }).click()
  await expect(
    page.getByText('An active record now uses its name. Rename or archive that one first.')
  ).toBeVisible()
})

test('adds a person with typed and picked dates, then archives them', async ({ page }) => {
  await page.goto('/employees')
  await page.getByRole('link', { name: 'New employee' }).click()
  await page.getByRole('textbox', { name: /First name/ }).fill('Eva')
  await page.getByRole('textbox', { name: /Last name/ }).fill('E2E Testová')
  await page.getByRole('combobox', { name: 'Department' }).click()
  await page.getByRole('option', { name: 'Laboratoře' }).click()
  const hired = page.getByRole('textbox', { name: /Hired/ })
  await hired.fill('3/2/2026')
  await hired.blur()
  await expect(hired).toHaveValue('3/2/2026')
  // Left: from the calendar, by keyboard, a week after the 1st of the month it opens on.
  await page.getByRole('button', { name: 'Choose Left from a calendar' }).click()
  const grid = page.getByRole('grid')
  await expect(grid).toBeVisible()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(grid).toHaveCount(0)
  await expect(page.getByRole('textbox', { name: 'Left' })).not.toHaveValue('')
  // Saved with an N ID, which imports never overwrite.
  await page.getByRole('combobox', { name: /Employment/ }).click()
  await page.getByRole('option', { name: 'Left', exact: true }).click()
  await save(page).click()
  await expect(page).toHaveURL(/\/employees\/N\d{4}$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Eva E2E Testová' })).toBeVisible()
  await expect(page.getByText('Mar 2, 2026')).toBeVisible()

  await page.getByRole('main').getByRole('button', { name: 'Archive' }).click()
  await page
    .getByRole('dialog', { name: 'Archive Eva E2E Testová?' })
    .getByRole('button', { name: 'Archive' })
    .click()
  await expect(page).toHaveURL(/\/employees$/)
  await page.getByRole('link', { name: 'Archived' }).click()
  // Listed by tag only, even to an admin; their own page says who it was.
  await expect(page.getByText('Eva E2E Testová')).toHaveCount(0)
  await page
    .getByRole('link', { name: /^Archived employee #[0-9a-f]{6}$/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: /E2E Testová/ })).toBeVisible()
})

test('plans a session with the time picker, books a person by hand, and cancels it', async ({
  page,
}) => {
  await page.goto('/sessions')
  await page.getByRole('link', { name: 'New session' }).click()
  await page.getByRole('combobox', { name: /Course/ }).click()
  await page.getByRole('option', { name: /^GDPR/ }).click()
  const date = page.getByRole('textbox', { name: /Date/ })
  await date.fill('3/15/2027')
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

  await page.getByRole('combobox', { name: 'Add a person' }).click()
  await page.getByRole('option', { name: 'Malá Alena' }).click()
  await page.getByRole('button', { name: 'Book' }).click()
  const booked = page.getByRole('main').getByRole('link', { name: 'Malá Alena' })
  await expect(booked).toBeVisible()

  // Booked, it cannot be archived; the dialog says why.
  await page.getByRole('main').getByRole('button', { name: 'Archive' }).click()
  const refusal = page.getByRole('dialog', { name: /^Archive S\d{3}/ })
  await expect(
    refusal.getByText('1 seat is taken on this session.', { exact: false })
  ).toBeVisible()
  await refusal.getByRole('button', { name: 'Cancel' }).click()

  await page.getByRole('button', { name: 'Cancel the booking of Malá Alena' }).click()
  await page
    .getByRole('dialog', { name: 'Remove Malá Alena from this session?' })
    .getByRole('button', { name: 'Remove' })
    .click()
  await expect(booked).toHaveCount(0)
})
