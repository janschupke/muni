import { czechCollator } from '@muni/utils/text'
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

/** What the server table's column under `header` shows, row by row (the first line of each). */
export async function columnTexts(page: Page, header: string): Promise<string[]> {
  const table = page.locator('[data-paging="server"] table').first()
  const headers = await table.locator('thead th').allInnerTexts()
  const index = headers.findIndex(text => text.trim().startsWith(header))
  expect(index, `a column headed "${header}"`).toBeGreaterThanOrEqual(0)
  const cells = await table
    .locator(`tbody > tr:not([id]) > :nth-child(${String(index + 1)})`)
    .allInnerTexts()
  return cells.map(text => text.split('\n')[0]?.trim() ?? '')
}

/**
 * The column is in the server's order: Czech, numbers within text by value, and what is
 * missing last in either direction. A column shows a missing value as empty, "—", or its own
 * words (`blank`: "No limit").
 */
export function expectSortedColumn(
  values: readonly string[],
  desc: boolean,
  label: string,
  blank = '—'
) {
  const missing = (v: string) => v === '' || v === blank
  const present = values.filter(v => !missing(v))
  expect(values.slice(present.length).every(missing), `${label}: missing values last`).toBe(true)
  const ordered = [...present].sort((a, b) =>
    desc ? czechCollator.compare(b, a) : czechCollator.compare(a, b)
  )
  expect(present, `${label}: ${desc ? 'descending' : 'ascending'}`).toEqual(ordered)
}
