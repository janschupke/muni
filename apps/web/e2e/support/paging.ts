import { expect, type Page } from '@playwright/test'

/**
 * Every table says how its rows are paged (`data-paging` on it or its frame): `server` (one
 * page the server sorted and cut), or why every row is here. A table that says neither is a
 * list nobody decided about.
 */
export async function expectTablesPaged(page: Page, label: string) {
  const undeclared = await page.evaluate(() =>
    [...document.querySelectorAll('table')]
      .filter(t => !t.closest('[aria-hidden="true"], [hidden]'))
      .filter(t => !t.closest('[data-paging]'))
      .map(t => t.getAttribute('aria-label') ?? t.querySelector('caption')?.textContent ?? '?')
  )
  expect(undeclared, `${label}: tables that do not say how they are paged`).toEqual([])
}
