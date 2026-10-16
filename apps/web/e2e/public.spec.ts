import { expect, test, type Page } from '@playwright/test'

const setLocale = (page: Page, locale: 'cs' | 'en') =>
  page.context().addCookies([{ name: 'NEXT_LOCALE', value: locale, url: 'http://localhost:3061' }])

test.describe('Czech browser', () => {
  test.use({ locale: 'cs-CZ' })

  test('dashboard follows Accept-Language and renders live data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Přehled' })).toBeVisible()
    await expect(page.getByText('Aktivní zaměstnanci', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plnění podle útvarů' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Laboratoře' })).toBeVisible()
    // No sign-in without Clerk keys, and no import link.
    await expect(page.getByRole('link', { name: 'Import' })).toHaveCount(0)
  })
})

test.describe('public register (signed out)', () => {
  test('language switch persists across navigation', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'English' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Courses' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible()
  })

  test('employees filter by department and compliance', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/employees')
    // Radix selects apply on change: no submit needed.
    await page.getByRole('combobox', { name: 'Department' }).click()
    await page.getByRole('option', { name: 'Laboratoře' }).click()
    await expect(page).toHaveURL(/department=Laborato/)
    await page.getByRole('combobox', { name: 'Compliance' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'Missing' }).click()
    await expect(page).toHaveURL(/compliance=MISSING/)
    await expect(page.getByRole('combobox', { name: 'Compliance' })).toHaveText('Missing')
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const badge of await rows.locator('td:nth-child(5)').allTextContents())
      expect(badge).toContain('Missing')
  })

  test('employees sort on the server, across pages', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/employees')
    const nameHeader = page.getByRole('columnheader', { name: 'Name' })
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    const firstName = () => page.locator('tbody tr').first().locator('td').first().locator('a')
    const first = await firstName().textContent()

    await nameHeader.getByRole('button').click()
    await expect(page).toHaveURL(/sort=name&dir=desc/)
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    await expect(firstName()).not.toHaveText(first ?? '')

    // The order holds on the next page: the sort travels with the page link.
    await page.getByRole('link', { name: 'Next' }).click()
    await expect(page).toHaveURL(/sort=name&dir=desc&page=2/)
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  })

  test('employee detail hides personal data from anonymous visitors', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/employees/E0153')
    await expect(page.getByRole('heading', { level: 1, name: 'Alena Malá' })).toBeVisible()
    const html = await page.content()
    expect(html).not.toContain('776217')
    expect(html).not.toContain('HYPERLINK')
    expect(html).not.toContain('alena.mala@')
    await expect(page.getByText('a•••••••••@vzorova.example')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  })

  test('compliance matrix prints values, not colour alone', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/compliance')
    const row = page.getByRole('row', { name: /Knihovna/ })
    await expect(row.getByRole('cell').nth(2)).toHaveText(/\d+\s?%/)
  })

  test('sessions show overbooking', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/sessions')
    await expect(page.getByText('Overbooked').first()).toBeVisible()
    await page.getByRole('link', { name: 'Past' }).click()
    await expect(page).toHaveURL(/when=past/)
  })

  test('sessions sort by price in the browser, unpriced last', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/sessions')
    const header = page.getByRole('columnheader', { name: 'Price' })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    const prices = (await page.locator('tbody tr td:nth-child(5)').allTextContents()).map(text =>
      text === '—' ? null : Number(text.replace(/[^\d.]/g, ''))
    )
    const priced = prices.filter(p => p !== null)
    expect(priced).toEqual([...priced].sort((a, b) => a - b))
    expect(prices.slice(priced.length).every(p => p === null)).toBe(true)
  })

  test('protected routes are not reachable without auth', async ({ page }) => {
    for (const path of [
      '/import',
      '/courses/BOZP-Z/edit',
      '/sessions/T001/edit',
      '/employees/E0001/edit',
    ]) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })

  test('theme switch is one tab stop driven by arrow keys', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/')
    await page.getByRole('radio', { name: 'Light' }).click()
    // Held like a real key: Radix moves focus on a timer and checks the item only while the
    // arrow is still down, so an instant press (down+up) would only move focus.
    await page.keyboard.down('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeFocused()
    await page.keyboard.up('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  })

  test('dark theme persists without a flash', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/')
    await page.getByRole('radio', { name: 'Dark' }).click()
    await page.reload()
    // The boot script sets data-theme before first paint; read it from the first response's DOM.
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    expect(bg).toBe('rgb(13, 13, 13)')
  })
})
