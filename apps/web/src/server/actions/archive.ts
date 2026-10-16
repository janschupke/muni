'use server'

import {
  type ArchiveImpact,
  archiveImpact,
  archiveRecord,
  unarchiveRecord,
} from '@muni/db/repositories'
import { ARCHIVABLE, type Archivable } from '@muni/domain/archive'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { archiveRefused, type ArchiveState } from '@/lib/form'
import { requireAdmin } from '@/server/auth'

// Archiving and bringing back, for every kind of record. Bound arguments reach the browser and
// come back from it, so each is checked here.

function checked(kind: Archivable, id: string, then: string | null) {
  if (!ARCHIVABLE.includes(kind) || typeof id !== 'string' || id === '') return false
  // Only a path in this app: never another origin.
  return then === null || (then.startsWith('/') && !then.startsWith('//'))
}

/** What archiving would do now, for the confirm dialog. Null for anyone but an admin. */
export async function previewArchive(kind: Archivable, id: string): Promise<ArchiveImpact | null> {
  if (!checked(kind, id, null)) return null
  try {
    await requireAdmin()
  } catch {
    return null
  }
  return archiveImpact(kind, id)
}

/**
 * Archives the record, then shows `then` (or stays, reporting `done`). A refusal says why and
 * how many things are in the way.
 */
export async function archiveAction(
  kind: Archivable,
  id: string,
  then: string | null,
  _state: ArchiveState
): Promise<ArchiveState> {
  if (!checked(kind, id, then)) return { status: 'refused', reason: 'generic' }
  const user = await requireAdmin()
  let impact: ArchiveImpact
  try {
    impact = await archiveRecord(kind, id, user.id)
  } catch (error) {
    console.error(error)
    return { status: 'refused', reason: 'generic' }
  }
  if (!impact.ok) return archiveRefused(impact.reason, impact.count)
  revalidatePath('/', 'layout')
  if (then) redirect(then)
  return { status: 'done' }
}

/** Brings an archived record back, then shows `then` (or stays, reporting `done`). */
export async function unarchiveAction(
  kind: Archivable,
  id: string,
  then: string | null,
  _state: ArchiveState
): Promise<ArchiveState> {
  if (!checked(kind, id, then)) return { status: 'refused', reason: 'generic' }
  await requireAdmin()
  let outcome: Awaited<ReturnType<typeof unarchiveRecord>>
  try {
    outcome = await unarchiveRecord(kind, id)
  } catch (error) {
    console.error(error)
    return { status: 'refused', reason: 'generic' }
  }
  if (!outcome.ok) {
    return outcome.reason === 'TAKEN'
      ? { status: 'refused', reason: 'taken', fields: outcome.fields }
      : {
          status: 'refused',
          reason: outcome.reason === 'NOT_FOUND' ? 'not_found' : 'parent_archived',
        }
  }
  revalidatePath('/', 'layout')
  if (then) redirect(then)
  return { status: 'done' }
}
