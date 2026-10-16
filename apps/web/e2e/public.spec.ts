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
    await page.getByLabel('Department').selectOption('Laboratoře')
    await page.getByLabel('Compliance').selectOption('MISSING')
    await page.getByRole('button', { name: 'Filter' }).click()
    await expect(page).toHaveURL(/department=Laborato/)
    const rows = page.locator('tbody tr')
    await expect(rows.first()).toBeVisible()
    for (const badge of await rows.locator('td:nth-child(5)').allTextContents())
      expect(badge).toContain('Missing')
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
