import type { Page } from '@playwright/test'

import { removeE2eRecords } from './support/db'
import { loaded } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// Every list sorts and pages on the server: a header asks for its order in the address (from
// the first page, everything else kept), the pager steps through pages in the address, and
// the rows that come back are the server's.

test.use({ storageState: storageState('admin') })

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
})

async function rows(page: Page) {
  const table = page.locator('[data-paging="server"] table').first()
  return table.locator('tbody > tr:not([id])').allInnerTexts()
}

const LISTS: { path: string; header: string; sort: string }[] = [
  { path: '/employees', header: 'Department', sort: 'department' },
  { path: '/courses', header: 'Valid for', sort: 'validity' },
  { path: '/departments', header: 'People', sort: 'people' },
  { path: '/positions', header: 'People', sort: 'people' },
  { path: '/providers', header: 'Completions', sort: 'completions' },
  { path: '/rooms', header: 'Seats', sort: 'capacity' },
  { path: '/users', header: 'Email', sort: 'email' },
  { path: '/sessions', header: 'Room', sort: 'room' },
  { path: '/sessions?when=past', header: 'Room', sort: 'room' },
  { path: '/advisor?view=action', header: 'Person', sort: 'person' },
]

for (const list of LISTS) {
  test(`${list.path} sorts on the server`, async ({ page }) => {
    await page.goto(list.path)
    await loaded(page)
    const before = await rows(page)
    const header = page.getByRole('button', { name: list.header, exact: true }).first()
    await header.click()
    await expect(page).toHaveURL(new RegExp(`[?&]sort=${list.sort}(&|$)`))
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
    await loaded(page)
    // Descending: the server's order flips, the first rows with it.
    await header.click()
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    expect(await rows(page)).not.toEqual(before)
  })
}

// Lists the seed fills past one page.
for (const path of ['/employees', '/advisor?view=action']) {
  test(`${path} pages on the server, keeping its sort`, async ({ page }) => {
    await page.goto(
      `${path}${path.includes('?') ? '&' : '?'}sort=${path === '/employees' ? 'name' : 'person'}&dir=desc`
    )
    await loaded(page)
    const first = await rows(page)
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: /Next/ })
      .click()
    await expect(page).toHaveURL(/[?&]page=2(&|$)/)
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    const second = await rows(page)
    expect(second.length).toBeGreaterThan(0)
    expect(second[0]).not.toEqual(first[0])
  })
}

test.describe('a department’s upcoming bookings', () => {
  // The seed books nobody by name: a page of the advisor's proposals first, removed after.
  test.afterAll(removeE2eRecords)

  test('sort on the server', async ({ page }) => {
    await page.goto('/advisor?view=action')
    await loaded(page)
    await page.getByRole('checkbox', { name: /^Select every proposed row/ }).click()
    await page.getByRole('button', { name: /^Book \d+ selected…$/ }).click()
    await page
      .getByRole('dialog', { name: 'Book trainings' })
      .getByRole('button', { name: /^Book \d+ trainings? · / })
      .click()
    await expect(page.getByText(/^Booked \d+ trainings?$/)).toBeVisible()

    await page.goto('/departments?sort=bookings&dir=desc')
    await loaded(page)
    await page
      .getByRole('link', { name: /upcoming bookings? of / })
      .first()
      .click()
    await expect(page).toHaveURL(/\/bookings$/)
    await loaded(page)
    const before = await rows(page)
    const header = page.getByRole('button', { name: 'Person', exact: true })
    await header.click()
    await expect(page).toHaveURL(/[?&]sort=person(&|$)/)
    await loaded(page)
    await header.click()
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    expect(await rows(page)).not.toEqual(before)
  })
})
