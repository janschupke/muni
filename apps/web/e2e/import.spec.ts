import path from 'node:path'

import { loaded } from './support/pages'
import { REGISTER_DIR } from './support/register'
import { expect, test } from './support/test'
import { storageState } from './support/users'

// The import, run for real as an admin. The raw exports are reviewed (their defects are
// named, not written); the register's own files (support/register.ts, what the setup
// seeded) go through the whole wizard: every record is there already, so the run writes
// nothing new and changes nothing, and what it proves is that the browser's review, the
// server action and the writer agree end to end. A fresh register is tested in the db suite
// (packages/db/src/integration/fresh-import.integration.test.ts).

test.use({ storageState: storageState('admin') })

const DATA = path.join(import.meta.dirname, '../../../data')

test('reviews the raw exports: a mistyped course, an impossible date and a copy refused', async ({
  page,
}) => {
  await page.goto('/import')
  await loaded(page)
  await page
    .locator('input[type=file]')
    .setInputFiles(['katalog_skoleni.csv', 'terminy_skoleni.csv'].map(f => path.join(DATA, f)))
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(2)
  await page.getByRole('button', { name: 'Review rows' }).click()

  await page.getByRole('tab', { name: /Sessions/ }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByRole('button', { name: /Errors/ })).toContainText('3')
  await panel.getByRole('button', { name: /Errors/ }).click()
  await expect(panel.getByRole('button', { name: /Problems on line 11/ })).toHaveAttribute(
    'aria-label',
    /Unknown course “KYB3R”\. Did you mean KYBER\?/
  )
})

test('imports the register’s files: reviewed, confirmed, written, and nothing new', async ({
  page,
}) => {
  await page.goto('/import')
  await loaded(page)
  await page
    .locator('input[type=file]')
    .setInputFiles(
      [
        'mistnosti.csv',
        'katalog_skoleni.csv',
        'zamestnanci.csv',
        'terminy_skoleni.csv',
        'absolvovana_skoleni.csv',
      ].map(f => path.join(REGISTER_DIR, f))
    )
  await expect(page.getByRole('button', { name: /^Remove / })).toHaveCount(5)
  await page.getByRole('button', { name: 'Review rows' }).click()

  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Ready to import' })).toBeVisible()
  await expect(page.getByText('Completions: 2,814 records will be written')).toBeVisible()
  await page.getByRole('button', { name: /^Import [\d,]+ records/ }).click()

  const status = page.getByRole('status').filter({ hasText: 'Import complete' })
  await expect(status).toBeVisible()
  for (const line of [
    'Rooms: 0 created, 0 updated, 9 unchanged',
    'Courses: 0 created, 0 updated, 10 unchanged',
    'Employees: 0 created, 0 updated, 170 unchanged',
    'Completions: 0 created, 0 updated, 2,814 unchanged',
    'Sessions: 0 created, 0 updated, 32 unchanged',
  ])
    await expect(page.getByText(line)).toBeVisible()
})
