import path from 'node:path'

import { loaded } from './support/pages'
import { baseUrlOf } from './support/server'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// The import, run for real: the raw exports through the wizard, as an admin, onto the
// register the seed filled from those same files. Every record is there already, so the run
// writes nothing new and changes nothing; what it proves is that the browser's review, the
// server action and the writer agree end to end. A fresh register is tested in the db suite
// (packages/db/src/integration/fresh-import.integration.test.ts).

test.use({ storageState: storageState('admin') })

test.beforeEach(async ({ page, baseURL }) => {
  await page.context().addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseUrlOf(baseURL) }])
})

const DATA = path.join(import.meta.dirname, '../../../data')

test('imports the raw exports: reviewed, confirmed, written, and nothing new', async ({ page }) => {
  test.setTimeout(180_000)
  await page.goto('/import')
  await loaded(page)
  await page
    .locator('input[type=file]')
    .setInputFiles(
      [
        'katalog_skoleni.csv',
        'zamestnanci.csv',
        'terminy_skoleni.csv',
        'absolvovana_skoleni.csv',
      ].map(f => path.join(DATA, f))
    )
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(4)
  await page.getByRole('button', { name: 'Review rows' }).click()

  // The sessions the importer refuses: a mistyped course, an impossible date, a copy.
  await page.getByRole('tab', { name: /Sessions/ }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByRole('button', { name: /Errors/ })).toContainText('3')
  await panel.getByRole('button', { name: /Errors/ }).click()
  await expect(panel.getByRole('button', { name: /Problems on line 11/ })).toHaveAttribute(
    'aria-label',
    /Unknown course “KYB3R”\. Did you mean KYBER\?/
  )

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible()
  await expect(page.getByText('Completions: 2,818 records will be written')).toBeVisible()
  await page.getByRole('button', { name: /^Import [\d,]+ records/ }).click()

  const status = page.getByRole('status').filter({ hasText: 'Import complete' })
  await expect(status).toBeVisible({ timeout: 150_000 })
  for (const line of [
    'Courses: 0 created, 10 updated',
    'Employees: 0 created, 170 updated',
    'Completions: 0 created, 2818 updated',
    'Sessions: 0 created, 31 updated',
  ])
    await expect(page.getByText(line)).toBeVisible()
})
