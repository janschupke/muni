import { clerk } from '@clerk/testing/playwright'

import { expect, test as setup } from './support/test'
import { E2E_USERS, type E2eRole, storageState } from './support/users'

// After global-setup.ts (the testing token, the users) and the register: each role signs in
// once, side by side, and its browser state is saved for the suites.

setup.describe.configure({ mode: 'parallel' })

for (const role of Object.keys(E2E_USERS) as E2eRole[]) {
  setup(`sign in as ${role}`, async ({ page }) => {
    expect(process.env.CLERK_TESTING_TOKEN, 'the testing token (global-setup.ts)').toBeTruthy()
    await page.goto('/')
    await clerk.signIn({ page, emailAddress: E2E_USERS[role].email })
    // The first signed-in request syncs the user (and the viewer's role) from Clerk.
    await page.goto('/')
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
    await page.context().storageState({ path: storageState(role) })
  })
}
