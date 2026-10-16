import 'server-only'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { type DeleteState, refused } from '@/lib/form'
import { requireUser } from '@/server/auth'

/**
 * The body of a delete action: deletes the record and shows the list, or says why it stays
 * (still in use, already gone, or the database failed).
 */
export async function deleteRecord(
  remove: () => Promise<'DELETED' | 'IN_USE'>,
  listHref: string
): Promise<DeleteState> {
  await requireUser()
  try {
    if ((await remove()) === 'IN_USE') return refused('in_use')
  } catch (error) {
    if ((error as { code?: unknown } | null)?.code === 'P2025') return refused('not_found')
    console.error(error)
    return refused('generic')
  }
  revalidatePath('/', 'layout')
  redirect(listHref)
}
