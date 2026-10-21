import { loaded } from './support/pages'
import { columnTexts, expectSortedColumn } from './support/paging'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// Every list sorts and pages on the server: a header asks for its order in the address (from
// the first page, everything else kept), the pager steps through pages in the address, and
// the rows that come back are the server's.

test.use({ storageState: storageState('admin') })

const LISTS: { path: string; header: string; sort: string; blank?: string }[] = [
  { path: '/employees', header: 'Department', sort: 'department' },
  { path: '/courses', header: 'Valid for', sort: 'validity', blank: 'No expiry' },
  { path: '/departments', header: 'People', sort: 'people' },
  { path: '/positions', header: 'People', sort: 'people' },
  { path: '/providers', header: 'Completions', sort: 'completions' },
  { path: '/rooms', header: 'Seats', sort: 'capacity', blank: 'No limit' },
  { path: '/users', header: 'Email', sort: 'email' },
  { path: '/sessions', header: 'Room', sort: 'room' },
  { path: '/sessions?when=past', header: 'Room', sort: 'room' },
  { path: '/advisor?view=action', header: 'Person', sort: 'person' },
]

for (const list of LISTS) {
  test(`${list.path} sorts on the server`, async ({ page }) => {
    await page.goto(list.path)
    await loaded(page)
    const header = page.getByRole('button', { name: list.header, exact: true }).first()
    await header.click()
    await expect(page).toHaveURL(new RegExp(`[?&]sort=${list.sort}(&|$)`))
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
    await loaded(page)
    expectSortedColumn(await columnTexts(page, list.header), false, list.path, list.blank)
    await header.click()
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    expectSortedColumn(await columnTexts(page, list.header), true, list.path, list.blank)
  })
}

// Lists the seed fills past one page.
for (const { path, sort, header } of [
  { path: '/employees', sort: 'name', header: 'Name' },
  { path: '/advisor?view=action', sort: 'person', header: 'Person' },
]) {
  test(`${path} pages on the server, keeping its sort`, async ({ page }) => {
    await page.goto(`${path}${path.includes('?') ? '&' : '?'}sort=${sort}&dir=desc`)
    await loaded(page)
    const first = await columnTexts(page, header)
    await page
      .getByRole('navigation', { name: 'Pages' })
      .getByRole('link', { name: /Next/ })
      .click()
    await expect(page).toHaveURL(/[?&]page=2(&|$)/)
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    const second = await columnTexts(page, header)
    expect(second.length).toBeGreaterThan(0)
    // The second page goes on where the first ended: one order across both.
    expectSortedColumn([...first, ...second], true, path)
  })
}

test.describe('a department’s upcoming bookings', () => {
  // The seed books nobody by name: a page of the advisor's proposals first, removed after.

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
    const header = page.getByRole('button', { name: 'Person', exact: true })
    await header.click()
    await expect(page).toHaveURL(/[?&]sort=person(&|$)/)
    await loaded(page)
    expectSortedColumn(await columnTexts(page, 'Person'), false, 'bookings')
    await header.click()
    await expect(page).toHaveURL(/[?&]dir=desc(&|$)/)
    await loaded(page)
    expectSortedColumn(await columnTexts(page, 'Person'), true, 'bookings')
  })
})
