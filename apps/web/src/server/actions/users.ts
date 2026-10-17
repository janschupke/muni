'use server'

import { clerkClient } from '@clerk/nextjs/server'
import { revertUserRole, setUserRole } from '@muni/db/repositories'
import { parseRole, roleMetadata } from '@muni/domain/enums'

import { formError, type FormState } from '@/lib/form'

import { isBoundId, logFailure, saveForm } from './guard'

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
  return saveForm(isBoundId(userId), async admin => {
    const role = parseRole(form.get('role'))
    if (!role) return { status: 'error', fieldErrors: { role: 'required' } }
    const saved = await setUserRole(userId, role, admin.id)
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
      logFailure(error)
      await revertUserRole(userId, { from: saved.previous, to: role })
      return formError('generic')
    }
    return { status: 'saved', href: `/users/${userId}` }
  })
}
