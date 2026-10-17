import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { E2E_USERS, findUser, storageState } from './support/users'

const DATA_PATHS = ['/employees', '/employees/E0153', '/compliance', '/advisor', '/users']

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
})

test.describe('visitors', () => {
  test('get the introduction, with sign-in and sign-up, and no data', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { level: 1, name: 'Training register' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What it does' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
    const html = await page.content()
    for (const data of ['Laboratoře', 'E0153', 'vzorova.example', 'BOZP'])
      expect(html, data).not.toContain(data)

    await page.getByRole('link', { name: 'Create account' }).click()
    await expect(page).toHaveURL(/\/sign-up/)
    await expect(page.locator('.cl-signUp-root, .cl-rootBox').first()).toBeVisible()
    await page.goto('/')
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
  })

  test('are sent to the app’s sign-in from every data page, without its data', async ({
    page,
    baseURL,
  }) => {
    for (const path of DATA_PATHS) {
      const response = await page.goto(path)
      // The app's own sign-in page, which returns them where they were going.
      const url = new URL(page.url())
      expect(url.origin, path).toBe(baseUrlOf(baseURL))
      expect(url.pathname, path).toBe('/sign-in')
      expect(url.searchParams.get('redirect_url'), path).toContain(path)
      const html = (await response?.text()) ?? ''
      for (const data of ['Alena Malá', 'Laboratoře', 'vzorova.example'])
        expect(html, `${path}: ${data}`).not.toContain(data)
    }
  })

  test('get pages that run only the app’s own scripts and cannot be framed', async ({
    request,
  }) => {
    for (const path of ['/', '/sign-in']) {
      const headers = (await request.get(path)).headers()
      const csp = headers['content-security-policy'] ?? ''
      expect(csp, path).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/)
      expect(csp, path).toContain("'strict-dynamic'")
      expect(csp, path).toContain("frame-ancestors 'none'")
      expect(csp, path).toContain("object-src 'none'")
      expect(headers['x-content-type-options'], path).toBe('nosniff')
      expect(headers['x-frame-options'], path).toBe('DENY')
      expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
      expect(headers['strict-transport-security'], path).toContain('max-age=')
      expect(headers['x-powered-by'], path).toBeUndefined()
    }
    // A new nonce on every response.
    const nonceOf = async () =>
      /'nonce-([^']+)'/.exec(
        (await request.get('/')).headers()['content-security-policy'] ?? ''
      )?.[1]
    expect(await nonceOf()).not.toBe(await nonceOf())
  })

  test('get a 404 for a missing file, not an error', async ({ request }) => {
    for (const path of ['/robots.txt', '/missing.png'])
      expect((await request.get(path)).status(), path).toBe(404)
    expect((await request.get('/icon.svg')).status()).toBe(200)
  })
})

test.describe('viewer', () => {
  test.use({ storageState: storageState('viewer') })

  test('got the viewer role on the first sign-in, in Clerk', async () => {
    const user = await findUser(E2E_USERS.viewer.email)
    expect(user?.publicMetadata).toEqual({ role: 'viewer' })
  })

  test('reads with the birth number, email and notes redacted, and cannot edit', async ({
    page,
  }) => {
    await page.goto('/employees/E0153')
    await expect(page.getByRole('banner').getByText('Viewer', { exact: true })).toBeVisible()
    const html = await page.content()
    expect(html).not.toContain('776217')
    expect(html).not.toContain('alena.mala@')
    await expect(page.getByText('Birth number')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
  })
})

test.describe('full access', () => {
  test.use({ storageState: storageState('full') })

  test('reads whole records, and still cannot edit', async ({ page }) => {
    await page.goto('/employees/E0153')
    await expect(page.getByRole('banner').getByText('Full access', { exact: true })).toBeVisible()
    await expect(page.getByText('Birth number')).toBeVisible()
    await expect(page.getByText(/^776217\/\d{3,4}$/)).toBeVisible()
    await expect(page.getByText(/^alena\.mala@/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Edit' })).toHaveCount(0)
    for (const path of ['/import', '/users', '/employees/E0153/edit']) {
      const response = await page.goto(path)
      expect(response?.status(), path).toBe(404)
    }
  })
})

test.describe('admin', () => {
  test.use({ storageState: storageState('admin') })

  test('edits, imports and sees who has access', async ({ page }) => {
    await page.goto('/employees/E0153')
    await expect(page.getByRole('banner').getByText('Admin', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await expect(page).toHaveURL(/\/employees\/E0153\/edit$/)
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue(/^alena\.mala@/)

    await page.goto('/import')
    await expect(page.getByRole('heading', { level: 1, name: 'Import' })).toBeVisible()

    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', {
        name: 'Users',
      })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: 'Users' })).toBeVisible()
    // Every e2e user signed in during setup, so each has a row with its role.
    for (const [role, label] of [
      ['viewer', 'Viewer'],
      ['full', 'Full access'],
      ['admin', 'Admin'],
    ] as const) {
      const row = page.getByRole('row').filter({ hasText: E2E_USERS[role].email })
      await expect(row.getByText(label, { exact: true }), role).toBeVisible()
    }
  })
})
