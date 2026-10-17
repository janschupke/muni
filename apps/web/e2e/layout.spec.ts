import type { Locator, Page } from '@playwright/test'

import { loaded } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// Geometry the eye catches and no other check does: an opened row's panel that stops short
// of its table, a toolbar whose controls do not line up, a wizard's steps bunched at one end.

// Wide, so a width cap on anything shows.
test.use({ storageState: storageState('admin'), viewport: { width: 1920, height: 1080 } })

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
})

async function box(locator: Locator) {
  const found = await locator.boundingBox()
  expect(found, 'element has a box').not.toBeNull()
  return found ?? { x: 0, y: 0, width: 0, height: 0 }
}

/** An opened row's panel spans its table, less the row's 16px padding on each side. */
async function expectOpenedRowFills(page: Page, path: string) {
  await page.goto(path)
  await loaded(page)
  await page.locator('tbody button[aria-expanded="false"]').first().click()
  const inset = page.locator('tbody tr > td[colspan] .sticky').first()
  await expect(inset).toBeVisible()
  // The table's frame inside its 1px border.
  const inner = await inset.locator('xpath=ancestor::table/..').evaluate(el => el.clientWidth)
  const padding = await box(inset)
  const panel = await box(inset.locator('> *').first())
  expect(Math.abs(padding.width - inner), `${path}: row as wide as the table`).toBeLessThan(1)
  expect(Math.abs(panel.width - (padding.width - 32)), `${path}: panel fills the row`).toBeLessThan(
    1
  )
}

/** Every control on one line of a toolbar shares that line's centre. */
async function expectToolbarAligned(page: Page, path: string) {
  await page.goto(path)
  await loaded(page)
  const centres = await page
    .locator('[data-slot=toolbar]')
    .first()
    .locator('button, input:not([type=hidden]), a[data-slot=button]')
    .evaluateAll(els =>
      els
        .filter(el => el.checkVisibility() && !el.closest('[aria-hidden=true]'))
        .map(el => {
          const r = el.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, centre: r.top + r.height / 2 }
        })
        .filter(r => r.bottom > r.top)
    )
  expect(centres.length, `${path}: toolbar has controls`).toBeGreaterThan(0)
  // Controls whose boxes overlap vertically sit on one line, and share its centre.
  for (const a of centres)
    for (const b of centres)
      if (a.top < b.bottom && b.top < a.bottom)
        expect(Math.abs(a.centre - b.centre), `${path}: toolbar line`).toBeLessThan(1.5)
}

test('an opened row’s panel spans its table on every list', async ({ page }) => {
  for (const path of [
    '/employees',
    '/courses',
    '/sessions',
    '/departments',
    '/positions',
    '/planner',
  ])
    await expectOpenedRowFills(page, path)
})

test('toolbar controls line up; route tabs sit on a row of their own', async ({ page }) => {
  await expectToolbarAligned(page, '/employees')
  await expectToolbarAligned(page, '/sessions')
  await expectToolbarAligned(page, '/sessions?when=past&course=BOZP-Z')
  const tabs = await box(page.getByRole('navigation', { name: 'Sessions' }))
  const toolbar = await box(page.locator('[data-slot=toolbar]').first())
  expect(toolbar.y).toBeGreaterThanOrEqual(tabs.y + tabs.height)
})

test('the import’s steps span the page', async ({ page }) => {
  await page.goto('/import')
  await loaded(page)
  const steps = await box(
    page.getByRole('list').filter({ has: page.locator('[aria-current=step]') })
  )
  // The page header's row: as wide as the page's content.
  const header = await box(page.getByRole('heading', { level: 1 }).locator('xpath=../..'))
  expect(Math.abs(steps.width - header.width)).toBeLessThan(2)
})
