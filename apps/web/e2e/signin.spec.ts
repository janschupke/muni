import { clerkLoaded, expect, test } from './support/test'
import { E2E_USERS } from './support/users'

// Signing in through the app, as a person does: on a server and database of its own
// (playwright.config.ts), as the writers are, since what it checks is how the app comes up
// after the sign-in, and a server busy with every reader's pages would slow it past any
// check.

test.describe('visitors', () => {
  test('who sign in from the introduction get the app in place, every word of it', async ({
    page,
  }) => {
    // The whole way in the app: the introduction, its sign-in link, Clerk's form, then home.
    // The root layout is not rendered again on the way, so what it gave the browser while
    // signed out has to serve the signed-in pages too.
    await page.goto('/')
    await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(/\/sign-in/)
    await clerkLoaded(page)
    // Clerk's own form, as a person fills it: the address, then the code a test address
    // (+clerk_test) always takes. Clerk then takes the browser home.
    await page.getByLabel('Email address').fill(E2E_USERS.full.email)
    // The code is entered once Clerk has sent it (its prepare step), as a person waits for it.
    const sent = page.waitForResponse(response => response.url().includes('/prepare_first_factor'))
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await sent
    await page.getByRole('textbox', { name: 'Enter verification code' }).pressSequentially('424242')
    // Clerk checks the code and takes the browser home; then the signed-in shell, once the
    // layout has the user (the first signed-in request asks Clerk for their role); then the
    // overview, once its data has streamed in.
    await expect(page).not.toHaveURL(/\/sign-in/)
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await expect(page.getByRole('banner').getByText('Full access', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  })
})
