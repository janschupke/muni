import { clerkSetup } from '@clerk/testing/playwright'

import { E2E_USERS, findUser, provisionE2eUsers } from './support/users'

/**
 * Before any project, in the main process (so every worker inherits it): Clerk's testing
 * token, which lets the browsers past Clerk's bot protection, and the three e2e users with
 * their roles (the viewer reset to none, for the app to fill in on first sign-in).
 */
export default async function globalSetup() {
  // Both are round trips to Clerk, and neither needs the other.
  await Promise.all([clerkSetup(), provisionE2eUsers()])
  const [viewer, admin] = (
    await Promise.all([findUser(E2E_USERS.viewer.email), findUser(E2E_USERS.admin.email)])
  ).map(user => user?.publicMetadata)
  if (JSON.stringify(viewer) !== '{}' || JSON.stringify(admin) !== '{"role":"admin"}')
    throw new Error(
      `e2e users not reset: viewer ${JSON.stringify(viewer)}, admin ${JSON.stringify(admin)}`
    )
}
