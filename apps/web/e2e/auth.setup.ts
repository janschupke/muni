import { clerk, clerkSetup } from '@clerk/testing/playwright'
import { expect, test as setup } from '@playwright/test'

import { E2E_USERS, type E2eRole, findUser, provisionE2eUsers, storageState } from './support/users'

// Runs before every other project: fetches Clerk's testing token, makes sure the three e2e
// users exist with their roles, and saves a signed-in browser state per role.

setup.describe.configure({ mode: 'serial' })

setup('clerk testing token', async () => {
  await clerkSetup()
  expect(process.env['CLERK_TESTING_TOKEN']).toBeTruthy()
})

setup('e2e users, the viewer without a role', async () => {
  await provisionE2eUsers()
  expect((await findUser(E2E_USERS.viewer.email))?.publicMetadata).toEqual({})
  expect((await findUser(E2E_USERS.admin.email))?.publicMetadata).toEqual({ role: 'admin' })
})

for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/')
    await clerk.signIn({ page, emailAddress: E2E_USERS[role].email })
    // The first signed-in request syncs the user (and the viewer's role) from Clerk.
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.context().storageState({ path: storageState(role) })
  })
}
