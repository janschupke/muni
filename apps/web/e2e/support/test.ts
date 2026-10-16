import { setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as base } from '@playwright/test'

export { expect } from '@playwright/test'

/**
 * Playwright's `test`, with Clerk's testing token on every page: Clerk's bot protection
 * would otherwise refuse the browser's requests to its Frontend API.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    await setupClerkTestingToken({ page })
    await provide(page)
  },
})
