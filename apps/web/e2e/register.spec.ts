import { activeProviders } from './support/db'
import { expectNotFound, holdPage, loaded, pointAt } from './support/pages'
import { columnTexts, expectSortedColumn } from './support/paging'
import { seededMonth } from './support/register'
import { expect, test } from './support/test'
import { storageState } from './support/users'

/** A month of the advisor's forecast with trainings lapsing in it, in today's frame. */
const MONTH = seededMonth('2026-11-15')

// The register as a viewer sees it: every page, read-only, personal data redacted.
test.use({ storageState: storageState('viewer') })

test.describe('Czech browser', () => {
  // No language chosen in the app: it follows the browser's.
  test.use({ locale: 'cs-CZ', appLocale: null })

  test('dashboard follows Accept-Language and renders live data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Přehled' })).toBeVisible()
    await expect(page.getByText('Aktivní zaměstnanci', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Plnění podle oddělení' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Laboratoře' })).toBeVisible()
    // Viewers get no administration: no import link.
    await expect(page.getByRole('link', { name: 'Import' })).toHaveCount(0)
  })
})

test.describe('register (viewer)', () => {
  test('employees filter by department and compliance', async ({ page }) => {
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
    await page.goto('/employees')
    const nameHeader = page.getByRole('columnheader', { name: 'Name' })
    await expect(nameHeader).toHaveAttribute('aria-sort', 'ascending')
    expectSortedColumn(await columnTexts(page, 'Name'), false, 'names')

    await nameHeader.getByRole('button').click()
    await expect(page).toHaveURL(/sort=name&dir=desc/)
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
    expectSortedColumn(await columnTexts(page, 'Name'), true, 'names')

    // The order holds on the next page: the sort travels with the page link.
    await page.getByRole('link', { name: 'Next' }).click()
    await expect(page).toHaveURL(/sort=name&dir=desc&page=2/)
    await expect(nameHeader).toHaveAttribute('aria-sort', 'descending')
  })

  test('employee detail hides personal data from viewers', async ({ page }) => {
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
    await page.goto('/compliance')
    const row = page.getByRole('row', { name: /Knihovna/ })
    await expect(row.getByRole('cell').nth(2)).toHaveText(/\d+\s?%/)
  })

  test('compliance matrix opens a department into its people and a cell into a list', async ({
    page,
  }) => {
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
    await page.goto('/sessions')
    await expect(page.getByText('Overbooked').first()).toBeVisible()
    // T032: 8 of 8 seats taken.
    await expect(page.getByRole('row').filter({ hasText: 'T032' }).getByText('Full')).toBeVisible()
    await page.getByRole('link', { name: 'Past' }).click()
    await expect(page).toHaveURL(/when=past/)
  })

  test('past sessions narrow to one course, with a chip that removes it', async ({ page }) => {
    await page.goto('/sessions?when=past&course=BOZP-Z')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Sessions of BOZP – základní školení' })
    ).toBeVisible()
    await expect(page.getByText('Course: BOZP – základní školení')).toBeVisible()
    const rows = page.locator('tbody > tr').filter({ has: page.locator('a[href^="/sessions/T"]') })
    await expect(rows.first()).toBeVisible()
    for (const text of await rows.allTextContents()) expect(text).toContain('BOZP')
    // Six past sessions fit one page: no page links.
    await expect(page.getByRole('navigation', { name: 'Pages' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Remove the course filter' }).click()
    await expect(page).toHaveURL(/\/sessions\?when=past$/)
    await expect(page.getByText('Course: BOZP – základní školení')).toHaveCount(0)
  })

  test('sessions sort by price in the browser, unpriced last', async ({ page }) => {
    await page.goto('/sessions')
    const header = page.getByRole('columnheader', { name: 'Price' })
    await header.getByRole('button').click()
    await expect(header).toHaveAttribute('aria-sort', 'ascending')
    // Found by its header, so another column never moves what is read.
    const column =
      (await page.locator('thead th').allTextContents()).findIndex(t => t.startsWith('Price')) + 1
    const prices = (
      await page.locator(`tbody tr td:nth-child(${String(column)})`).allTextContents()
    ).map(text => (text === '—' ? null : Number(text.replace(/[^\d.]/g, ''))))
    const priced = prices.filter(p => p !== null)
    expect(priced).toEqual([...priced].sort((a, b) => a - b))
    expect(prices.slice(priced.length).every(p => p === null)).toBe(true)
  })

  test('overview cards open the list they count, and the numbers agree', async ({ page }) => {
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
    await page.goto('/employees?q=E0153')
    const toggle = page.getByRole('button', { name: 'Details for Malá Alena' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const detail = page.locator(`#${(await toggle.getAttribute('aria-controls')) ?? ''}`)
    await expect(detail.getByRole('columnheader', { name: 'Valid until' })).toBeVisible()
    await expect(detail.getByText(/in \d+ days|ago/).first()).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Held' })).toBeVisible()
  })

  test('back links return to the page the reader came from, filters included', async ({ page }) => {
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

  test('the advisor breaks non-compliance down and links what it names, read-only for viewers', async ({
    page,
  }) => {
    await page.goto('/advisor')
    await expect(page.getByRole('heading', { level: 1, name: 'Advisor' })).toBeVisible()
    await expect(
      page.getByRole('heading', { name: /^Non-compliant now: \d+ trainings$/ })
    ).toBeVisible()

    // A month in the chart selects its trainings.
    await page.getByRole('link', { name: new RegExp(`^${MONTH.label}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/advisor\\?bucket=${MONTH.bucket}$`))
    await expect(
      page.getByRole('heading', { name: new RegExp(`^${MONTH.label}: \\d+ trainings?$`) })
    ).toBeVisible()

    // A count opens its view; viewers see the proposals but cannot save them.
    await page
      .getByRole('link', { name: /^Action required/ })
      .first()
      .click()
    await expect(page).toHaveURL(/view=action/)
    await expect(page.getByText('Only admins can book people.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Save|^Book/ })).toHaveCount(0)

    // A room opens its page, which lists the sessions held there.
    const table = page.getByRole('table', { name: 'Action required' })
    const room = table.locator('a[href^="/rooms/"]').first()
    const name = (await room.textContent()) ?? ''
    await room.click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    // Its sessions, without a room column that would only repeat its name.
    const held = page.getByRole('table', { name: 'Upcoming sessions' })
    await expect(held.locator('tbody a[href^="/sessions/"]').first()).toBeVisible()
    await expect(held.getByRole('columnheader', { name: 'Room' })).toHaveCount(0)

    // A date opens the session, ready to book the person it is proposed for; its back link
    // returns to the advisor view.
    await page.goBack()
    await table.locator('a[href^="/sessions/T"]').first().click()
    await expect(page).toHaveURL(/\/sessions\/T\d+\?employee=E\d+$/)
    await expect(page.getByRole('link', { name: 'Back to Advisor' })).toHaveAttribute(
      'href',
      '/advisor?view=action'
    )

    await page.goto('/advisor?view=overbooked')
    for (const id of ['T016', 'T030'])
      await expect(page.locator(`a[href="/sessions/${id}"]`).first()).toBeVisible()
  })

  test('the advisor’s counts and rows agree, and its pages live in the address', async ({
    page,
  }) => {
    await page.goto('/advisor')
    // The forecast card opens the row that lists exactly what it counts.
    const card = page.getByRole('link', { name: /^Lapsing by / }).first()
    await card.click()
    await expect(page).toHaveURL(/\/advisor\?bucket=upcoming$/)
    const heading = page.getByRole('heading', { name: /^Lapsing by .+: \d+ trainings?$/ })
    const total = /: (\d+) /.exec((await heading.textContent()) ?? '')?.[1] ?? 'none'
    await expect(card).toContainText(total)
    await expect(page.locator('a[data-slot=choice][aria-current=true]')).toContainText(
      `${total} trainings`
    )

    // A page is an address: next goes to ?page=2, a new row starts again from the first.
    await page.goto('/advisor')
    await page.getByRole('link', { name: /^Next/ }).click()
    await expect(page).toHaveURL(/\/advisor\?page=2$/)
    await expect(page.getByText(/^Page 2 of \d+$/)).toBeVisible()
    await page.getByRole('link', { name: new RegExp(`^${MONTH.label}`) }).click()
    await expect(page).toHaveURL(new RegExp(`/advisor\\?bucket=${MONTH.bucket}$`))
    await expect(page.locator('tbody tr').first()).toBeVisible()
    // A page past the end shows the last one, with its rows.
    await page.goto(`/advisor?bucket=${MONTH.bucket}&page=9`)
    await expect(page.getByText(/^Page (\d+) of \1$/)).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('planner proposes sessions with a room for training nothing else can take', async ({
    page,
  }) => {
    await page.goto('/planner')
    await expect(page.getByRole('heading', { level: 1, name: 'Session planner' })).toBeVisible()
    await expect(page.getByText('Only admins can create sessions.')).toBeVisible()
    const room = page.locator('main table a[href^="/rooms/"]').first()
    await expect(room).toBeVisible()
    await expect(page.getByRole('button', { name: /^Review session/ })).toHaveCount(0)
    await room.click()
    await expect(page).toHaveURL(/\/rooms\//)
  })

  test('providers: the list, one provider, and the way there from a completion', async ({
    page,
  }) => {
    await page.goto('/employees/E0153')
    const provider = page.locator('main a[href^="/providers/"]').first()
    const name = (await provider.textContent()) ?? ''
    await provider.click()
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
    await expect(page.getByText(/\d+ completions · \d+ people · \d+ courses/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'By course' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Completions', exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Providers' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Providers' })).toBeVisible()
    // Every active provider, as many as the register holds.
    await expect(page.locator('tbody a[href^="/providers/"]')).toHaveCount(await activeProviders())
  })

  test('footer, and tab strips without a scrollbar', async ({ page }) => {
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

  test('the sidebar collapses to icons and stays collapsed', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/courses')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    const nav = page.getByRole('navigation', { name: 'Main navigation' })
    await expect(nav.getByRole('link', { name: 'Courses' })).toHaveText('')
    // Language and theme stay in the top bar whatever the sidebar does.
    const header = page.getByRole('banner')
    await expect(header.getByRole('radiogroup', { name: 'Language' })).toBeVisible()
    await expect(header.getByRole('radiogroup', { name: 'Colour theme' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
    await expect(nav.getByRole('link', { name: 'Courses' })).toHaveText('Courses')
  })

  test('a menu click shows the next page at once, and its data as it comes', async ({ page }) => {
    // The page's own answer is held back: what shows meanwhile is the loading state the menu
    // fetched as the pointer reached the link, never the old page waiting.
    const release = await holdPage(page, '/employees')
    await page.goto('/')
    await loaded(page)
    const link = page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Employees' })
    await pointAt(link, '/employees')
    await link.click()
    // At once: a second is far more than a click in the app takes, and far less than a wait.
    await expect(page).toHaveURL(/\/employees$/, { timeout: 1000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Employees' })).toBeVisible({
      timeout: 1000,
    })
    await expect(page.getByRole('main').getByRole('status')).toHaveAttribute('aria-busy', 'true')
    release()
    await expect(page.getByRole('main').getByRole('table')).toBeVisible()
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  })

  test('the language switch turns the page into the other language, and the next pages follow', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
    await page.evaluate(() => {
      ;(window as { before?: boolean }).before = true
    })
    await page
      .getByRole('banner')
      .getByRole('radiogroup', { name: 'Language' })
      .getByRole('radio', { name: 'Čeština' })
      .click()
    // The same page, rendered again in Czech: no navigation, no reload.
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs')
    await expect(page.getByRole('heading', { level: 1, name: 'Přehled' })).toBeVisible()
    await expect(page.getByRole('radiogroup', { name: 'Jazyk' })).toBeVisible()
    expect(await page.evaluate(() => (window as { before?: boolean }).before)).toBe(true)
    // The choice is kept: the next page is Czech too.
    await page
      .getByRole('navigation', { name: 'Hlavní navigace' })
      .getByRole('link', { name: 'Kurzy' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Kurzy' })).toBeVisible()
  })

  test('on a phone the navigation opens from the menu and closes on the way', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden()
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const drawer = page.getByRole('dialog', { name: 'Menu' })
    await drawer.getByRole('link', { name: 'Rooms' }).click()
    await expect(page).toHaveURL(/\/rooms$/)
    await expect(drawer).toBeHidden()
    await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible()
  })

  test('no page scrolls sideways, from a phone to a wide screen', async ({ page }) => {
    // Each page loaded once and resized through the widths: the layout follows the viewport
    // (CSS and media queries), so a reload per width would only repeat the same page.
    for (const path of [
      '/',
      '/employees',
      '/compliance',
      '/advisor',
      '/planner',
      '/rooms',
      '/providers',
    ]) {
      await page.setViewportSize({ width: 360, height: 900 })
      await page.goto(path)
      for (const width of [360, 390, 1024, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        // A frame, so what listens to the width (media queries in script) has answered.
        const { scrollWidth, clientWidth } = await page.evaluate(
          () =>
            new Promise<{ scrollWidth: number; clientWidth: number }>(resolve => {
              requestAnimationFrame(() => {
                resolve({
                  scrollWidth: document.documentElement.scrollWidth,
                  clientWidth: document.documentElement.clientWidth,
                })
              })
            })
        )
        expect(scrollWidth, `${path} at ${String(width)}px`).toBeLessThanOrEqual(clientWidth)
      }
    }
  })

  test('a missing record says which one, and leads back to its list', async ({ page }) => {
    await page.goto('/employees/E9999')
    await expectNotFound(page, 'Employee not found')
    // An address no route matches has no page to stream: that one still answers 404.
    expect((await page.request.get('/no-such-page')).status()).toBe(404)
    await expect(page.getByText('There is no employee E9999 in the register.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'All employees' })).toHaveAttribute(
      'href',
      '/employees'
    )
  })

  test('edit, import and user pages are not found for viewers', async ({ page }) => {
    for (const path of [
      '/import',
      '/users',
      '/courses/BOZP-Z/edit',
      '/sessions/T001/edit',
      '/employees/E0001/edit',
      '/providers/new',
    ]) {
      await page.goto(path)
      await expectNotFound(page)
    }
  })

  test('theme switch is one tab stop driven by arrow keys', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('radio', { name: 'Light' }).click()
    // Held like a real key: Radix moves focus on a timer and checks the item only while the
    // arrow is still down, so an instant press (down+up) would only move focus.
    await page.keyboard.down('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeFocused()
    await page.keyboard.up('ArrowRight')
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeFocused()
    await expect(page.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('dark')
  })

  test('dark theme persists without a flash', async ({ page }) => {
    await page.goto('/')
    // The page's lightness: 0 black to 1 white (the mean of its red, green and blue).
    const lightness = () =>
      page.evaluate(() => {
        const [r = 0, g = 0, b = 0] = getComputedStyle(document.body)
          .backgroundColor.match(/\d+/g)
          ?.map(Number) ?? [0, 0, 0]
        return (r + g + b) / (3 * 255)
      })
    await page.getByRole('radio', { name: 'Light' }).click()
    const light = await lightness()
    await page.getByRole('radio', { name: 'Dark' }).click()
    await page.reload()
    // The boot script sets data-theme before first paint; read it from the first response's DOM.
    expect(await page.evaluate(() => document.documentElement.dataset['theme'])).toBe('dark')
    // The dark page itself, not the light one: whatever the tokens' exact values.
    expect(light).toBeGreaterThan(0.8)
    expect(await lightness()).toBeLessThan(0.2)
  })
})
