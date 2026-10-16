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
    await page.getByRole('combobox', { name: 'Has training' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('option', { name: 'Missing' }).click()
    await expect(page).toHaveURL(/compliance=MISSING/)
    await expect(page.getByRole('combobox', { name: 'Has training' })).toHaveText('Missing')
    // "Has a training in this state": every row's details list a missing one.
    const toggles = page.getByRole('button', { name: /^Details for / })
    await expect(toggles.first()).toBeVisible()
    for (const toggle of (await toggles.all()).slice(0, 5)) {
      await toggle.click()
      const detail = page.locator(`#${(await toggle.getAttribute('aria-controls')) ?? ''}`)
      await expect(detail.getByText('Missing').first()).toBeVisible()
    }
  })

  test('employees sort on the server, across pages', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/employees')
    const nameHeader = page.getByRole('columnheader', { name: 'Name' })
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    const firstName = () => page.locator('tbody tr').first().locator('td').nth(1).locator('a')
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

  test('compliance matrix opens a department into its people and a cell into a list', async ({
    page,
  }) => {
    await setLocale(page, 'en')
    await page.goto('/compliance')
    await page.getByRole('button', { name: 'People in Knihovna' }).click()
    const person = page.getByRole('row').filter({ has: page.locator('a[href^="/employees/E"]') })
    await expect(person.first()).toBeVisible()
    await person.first().getByRole('link').click()
    await expect(page).toHaveURL(/\/employees\/E\d+$/)

    await page.goBack()
    await page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / }).click()
    const dialog = page.getByRole('dialog', { name: 'Laboratoře · BOZP – základní školení' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Course detail' })).toHaveAttribute(
      'href',
      '/courses/BOZP-Z'
    )
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(
      page.getByRole('button', { name: /^Laboratoře, BOZP – základní školení: / })
    ).toBeFocused()
  })

  test('sessions show overbooking', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/sessions')
    await expect(page.getByText('Overbooked').first()).toBeVisible()
    // T011: 28 of 30 seats taken.
    await expect(
      page.getByRole('row').filter({ hasText: 'T011' }).getByText('Almost full')
    ).toBeVisible()
    await page.getByRole('link', { name: 'Past' }).click()
    await expect(page).toHaveURL(/when=past/)
  })

  test('sessions sort by price in the browser, unpriced last', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/sessions')
    const header = page.getByRole('columnheader', { name: 'Price' })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    // Column 1 is the attendee disclosure; price is the sixth cell.
    const prices = (await page.locator('tbody tr td:nth-child(6)').allTextContents()).map(text =>
      text === '—' ? null : Number(text.replace(/[^\d.]/g, ''))
    )
    const priced = prices.filter(p => p !== null)
    expect(priced).toEqual([...priced].sort((a, b) => a - b))
    expect(prices.slice(priced.length).every(p => p === null)).toBe(true)
  })

  test('overview cards open the list they count, and the numbers agree', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/')
    const card = page.getByRole('link', { name: /^Expired/ })
    // The card's last line is "<n> people": the list behind it must hold exactly them.
    const hint = (await card.locator('span').last().textContent()) ?? ''
    const people = Number(/^(\d+)/.exec(hint)?.[1])
    expect(people).toBeGreaterThan(0)
    await card.click()
    await expect(page).toHaveURL(/status=ACTIVE&compliance=EXPIRED/)
    await expect(page.getByText(`${String(people)} employees`, { exact: true })).toBeVisible()
  })

  test('an employee row opens to their trainings and expiry', async ({ page }) => {
    await setLocale(page, 'en')
    await page.goto('/employees?q=E0153')
    const toggle = page.getByRole('button', { name: 'Details for Malá Alena' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const detail = page.locator(`#${(await toggle.getAttribute('aria-controls')) ?? ''}`)
    await expect(detail.getByRole('columnheader', { name: 'Valid until' })).toBeVisible()
    await expect(detail.getByText(/in \d+ days|ago/).first()).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Valid trainings' })).toBeVisible()
  })

  test('back links return to the page the visitor came from, filters included', async ({
    page,
  }) => {
    await setLocale(page, 'en')
    await page.goto('/employees?department=Laborato%C5%99e&sort=compliance')
    await page.locator('tbody tr').first().locator('td').nth(1).locator('a').click()
    const back = page.getByRole('link', { name: 'Back to Employees' })
    await expect(back).toHaveAttribute('href', /department=Laborato.*sort=compliance/)
    await back.click()
    await expect(page).toHaveURL(/department=Laborato.*sort=compliance/)

    // Opened directly, the link falls back to the parent list; from a course, it names the course.
    await page.goto('/courses/BOZP-Z')
    await page.getByRole('link', { name: /Čern/ }).first().click()
    await expect(
      page.getByRole('link', { name: 'Back to BOZP – základní školení' })
    ).toHaveAttribute('href', '/courses/BOZP-Z')
  })

  test('the advisor breaks non-compliance down and links what it names, read-only for visitors', async ({
    page,
  }) => {
    await setLocale(page, 'en')
    await page.goto('/advisor')
    await expect(page.getByRole('heading', { level: 1, name: 'Advisor' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /^Non-compliant now: \d+ trainings$/ })
    ).toBeVisible()

    // A month in the chart selects its trainings.
    await page.getByRole('link', { name: /^November 2026/ }).click()
    await expect(page).toHaveURL(/\/advisor\?bucket=2026-11$/)
    await expect(
      page.getByRole('heading', { name: /^November 2026: \d+ trainings?$/ })
    ).toBeVisible()

    // A count opens its view; visitors see the proposals but cannot save them.
    await page
      .getByRole('link', { name: /^Action required/ })
      .first()
      .click()
    await expect(page).toHaveURL(/view=action/)
    await expect(page.getByText('Sign in to save bookings.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Save|^Book/ })).toHaveCount(0)

    // A room opens its page, which lists the sessions held there.
    const table = page.getByRole('table', { name: 'Action required' })
    const room = table.locator('a[href^="/rooms/"]').first()
    const name = (await room.textContent()) ?? ''
    await room.click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    const rooms = page.locator('tbody a[href^="/rooms/"]')
    await expect(rooms.first()).toBeVisible()
    for (const link of await rooms.all()) await expect(link).toHaveText(name)

    // A date opens the session, whose back link returns to the advisor view.
    await page.goBack()
    await table.locator('a[href^="/sessions/T"]').first().click()
    await expect(page).toHaveURL(/\/sessions\/T\d+$/)
    await expect(page.getByRole('link', { name: 'Back to Advisor' })).toHaveAttribute(
      'href',
      '/advisor?view=action'
    )

    await page.goto('/advisor?view=overbooked')
    for (const id of ['T016', 'T030'])
      await expect(page.locator(`a[href="/sessions/${id}"]`).first()).toBeVisible()
  })

  test('planner proposes sessions with a room for training nothing else can take', async ({
    page,
  }) => {
    await setLocale(page, 'en')
    await page.goto('/planner')
    await expect(page.getByRole('heading', { level: 1, name: 'Session planner' })).toBeVisible()
    await expect(page.getByText('Sign in to create sessions.')).toBeVisible()
    const room = page.locator('main table a[href^="/rooms/"]').first()
    await expect(room).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create session' })).toHaveCount(0)
    await room.click()
    await expect(page).toHaveURL(/\/rooms\//)
  })

  test('footer, and tab strips without a scrollbar', async ({ page }) => {
    await setLocale(page, 'en')
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/sessions')
      await expect(page.getByRole('contentinfo')).toContainText('Data as of')
      for (const strip of await page
        .locator('nav[aria-label="Sessions"], nav[aria-label="Main navigation"]')
        .all()) {
        const { scrollHeight, clientHeight } = await strip.evaluate(e => ({
          scrollHeight: e.scrollHeight,
          clientHeight: e.clientHeight,
        }))
        expect(scrollHeight, `${String(width)}px`).toBe(clientHeight)
      }
    }
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
