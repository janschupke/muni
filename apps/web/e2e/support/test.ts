import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test as base } from '@playwright/test'

export { expect }

/** What the specs read of Clerk in the page. */
interface ClerkWindow {
  Clerk?: { loaded?: boolean; session?: { getToken(): Promise<string | null> } | null }
}

/**
 * Playwright's `test`, with Clerk's testing token on every page (Clerk's bot protection
 * would otherwise refuse the browser's requests to its Frontend API), every visit waiting
 * until the app runs in the browser, and no Content-Security-Policy violation and no error
 * thrown in the page allowed (a hydration mismatch, React #418, re-renders the whole page).
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await setupClerkTestingToken({ page })
    // Anything the Content-Security-Policy blocked fails the test that loaded it.
    const blocked: string[] = []
    const thrown: string[] = []
    page.on('pageerror', error => {
      thrown.push(error.message)
    })
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
        blocked.push(message.text())
    })
    // Pages arrive with their data from the server; a click before the app starts would
    // reload instead of navigating in the app. Every visit waits for the app to start.
    const goto = page.goto.bind(page)
    let tokenFresh = false
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
      // The stored sign-in's session token is long expired. The server renews it for a page
      // load (a GET), but only Clerk in the browser writes a fresh one to the cookie; a save
      // made before that posts the old token, and Clerk sends a POST to sign-in. A person is
      // never that quick; a test is. Once written, Clerk keeps it fresh: only the first visit
      // of a test waits.
      if (!tokenFresh) {
        await page.waitForFunction(() => (window as unknown as ClerkWindow).Clerk?.loaded === true)
        await page.evaluate(async () => {
          await (window as unknown as ClerkWindow).Clerk?.session?.getToken()
        })
        tokenFresh = true
      }
      return response
    }
    await provide(page)
    expect(blocked, 'Content-Security-Policy violations').toEqual([])
    expect(thrown, 'errors thrown in the page').toEqual([])
  },
})
