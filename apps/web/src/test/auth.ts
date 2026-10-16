import type { Role } from '@muni/domain/enums'
import { vi } from 'vitest'

import { getSessionUser, requireAdminPage, requireReader, type SessionUser } from '@/server/auth'

function sessionUser(role: Role): SessionUser {
  const name = role.toLowerCase()
  return { id: `usr_${name}`, clerkId: `user_${name}`, role, name, email: `${name}@example.com` }
}

/**
 * Signs a test file's automocked `@/server/auth` (`vi.mock('@/server/auth')`) in as `role`.
 * The guards are mocks: pages only show they call them, and `requireAdminPage` lets the page
 * render. What the guards refuse is tested in server.test.ts.
 */
export function signInAs(role: Role): SessionUser {
  const user = sessionUser(role)
  vi.mocked(getSessionUser).mockResolvedValue(user)
  vi.mocked(requireReader).mockResolvedValue(user)
  vi.mocked(requireAdminPage).mockResolvedValue(sessionUser('ADMIN'))
  return user
}

/** A visitor: no session. `requireReader` stands for the sign-in redirect by rejecting. */
export function signOut(): void {
  vi.mocked(getSessionUser).mockResolvedValue(null)
  vi.mocked(requireReader).mockRejectedValue(new Error('redirect to sign-in'))
}
