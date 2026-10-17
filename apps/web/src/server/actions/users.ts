'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { canSetUserRole, setUserRole } from '@muni/db/repositories'
import { parseRole, roleMetadata } from '@muni/domain/enums'

import { formError, type FormState } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

/**
 * Changes a user's role. Clerk holds roles, so it is written there first and then mirrored;
 * an admin cannot change their own role, nor take the role from the last admin.
 */
export async function saveUserRole(
  userId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  const admin = await requireAdmin()
  const role = parseRole(form.get('role'))
  if (!role) return { status: 'error', fieldErrors: { role: 'required' } }
  const allowed = await canSetUserRole(userId, role, admin.id)
  if (!allowed.ok) {
    if (allowed.reason === 'NOT_FOUND') return formError('not_found')
    return {
      status: 'error',
      fieldErrors: { role: allowed.reason === 'SELF' ? 'own_role' : 'last_admin' },
    }
  }
  try {
    const users = (await clerkClient()).users
    await users.updateUserMetadata(allowed.clerkId, {
      publicMetadata: { role: roleMetadata(role) },
    })
    const saved = await setUserRole(userId, role, admin.id)
    if (!saved.ok) return formError(saved.reason === 'NOT_FOUND' ? 'not_found' : 'generic')
  } catch (error) {
    console.error(error)
    return formError('generic')
  }
  return { status: 'saved', href: `/users/${userId}` }
}
