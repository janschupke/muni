'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { revertUserRole, setUserRole } from '@muni/db/repositories'
import { parseRole, roleMetadata } from '@muni/domain/enums'

import { formError, type FormState } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

/**
 * Changes a user's role. The database is written first, under the lock that keeps the last
 * admin, then Clerk (which signs people in and which every sync reads). If Clerk refuses, the
 * database goes back to the previous role. An admin cannot change their own role.
 */
export async function saveUserRole(
  userId: string,
  _state: FormState,
  form: FormData
): Promise<FormState> {
  const admin = await requireAdmin()
  const role = parseRole(form.get('role'))
  if (!role) return { status: 'error', fieldErrors: { role: 'required' } }
  let saved: Awaited<ReturnType<typeof setUserRole>>
  try {
    saved = await setUserRole(userId, role, admin.id)
  } catch (error) {
    console.error(error)
    return formError('generic')
  }
  if (!saved.ok) {
    if (saved.reason === 'NOT_FOUND') return formError('not_found')
    return {
      status: 'error',
      fieldErrors: { role: saved.reason === 'SELF' ? 'own_role' : 'last_admin' },
    }
  }
  try {
    const users = (await clerkClient()).users
    await users.updateUserMetadata(saved.clerkId, {
      publicMetadata: { role: roleMetadata(role) },
    })
  } catch (error) {
    console.error(error)
    await revertUserRole(userId, { from: saved.previous, to: role })
    return formError('generic')
  }
  return { status: 'saved', href: `/users/${userId}` }
}
