import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { expect, test as base } from '@playwright/test'

export { expect }

/**
 * Playwright's `test`, with Clerk's testing token on every page: Clerk's bot protection
 * would otherwise refuse the browser's requests to its Frontend API.
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
    await provide(page)
    expect(blocked, 'Content-Security-Policy violations').toEqual([])
  },
})
