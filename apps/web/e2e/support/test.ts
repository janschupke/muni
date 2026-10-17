import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test as base } from '@playwright/test'

export { expect }

/**
 * Playwright's `test`, with Clerk's testing token on every page (Clerk's bot protection
 * would otherwise refuse the browser's requests to its Frontend API), every visit waiting
 * until the app runs in the browser, and no Content-Security-Policy violation allowed.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await setupClerkTestingToken({ page })
    // Anything the Content-Security-Policy blocked fails the test that loaded it.
    const blocked: string[] = []
    page.on('console', message => {
      if (message.type() === 'error' && /Content Security Policy/i.test(message.text()))
        blocked.push(message.text())
    })
    // Pages arrive with their data from the server; a click before the app starts would
    // reload instead of navigating in the app. Every visit waits for the app to start.
    const goto = page.goto.bind(page)
    page.goto = async (url, options) => {
      const response = await goto(url, options)
      await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
      return response
    }
    await provide(page)
    expect(blocked, 'Content-Security-Policy violations').toEqual([])
  },
})
