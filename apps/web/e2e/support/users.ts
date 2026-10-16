import path from 'node:path'

import { createClerkClient } from '@clerk/backend'

/** The e2e accounts in the Clerk development instance, one per role. */
export const E2E_USERS = {
  /** No role in Clerk until the app gives it one on the first sign-in. */
  viewer: { email: 'muni-e2e-viewer+clerk_test@example.com', role: null, name: 'E2E Viewer' },
  full: { email: 'muni-e2e-full+clerk_test@example.com', role: 'full', name: 'E2E Full' },
  admin: { email: 'muni-e2e-admin+clerk_test@example.com', role: 'admin', name: 'E2E Admin' },
} as const

export type E2eRole = keyof typeof E2E_USERS

/** Where the setup project saves each role's signed-in browser state. */
export const storageState = (role: E2eRole) =>
  path.join(import.meta.dirname, '../.auth', `${role}.json`)

/**
 * The Clerk backend client, for development keys only: the setup creates and edits users,
 * which must never happen in a production instance.
 */
export function clerkBackend() {
  const secretKey = process.env['CLERK_SECRET_KEY']
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  if (!secretKey?.startsWith('sk_test_') || !publishableKey?.startsWith('pk_test_'))
    throw new Error('e2e needs Clerk development keys (pk_test_/sk_test_) in .env')
  return createClerkClient({ secretKey, publishableKey })
}

/** The e2e user with this email, or null. */
export async function findUser(email: string) {
  const { data } = await clerkBackend().users.getUserList({ emailAddress: [email] })
  return data[0] ?? null
}

/**
 * Creates the e2e users that are missing and resets their roles. The viewer starts every run
 * without one, so the app has to fill it in again on the first sign-in.
 */
export async function provisionE2eUsers(): Promise<void> {
  const users = clerkBackend().users
  for (const { email, role, name } of Object.values(E2E_USERS)) {
    const [firstName = name, lastName = ''] = name.split(' ')
    const publicMetadata = role === null ? {} : { role }
    const existing = await findUser(email)
    if (existing) await users.updateUser(existing.id, { publicMetadata })
    else
      await users.createUser({
        emailAddress: [email],
        firstName,
        lastName,
        publicMetadata,
        skipPasswordRequirement: true,
      })
  }
}
