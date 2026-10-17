'use server'

import {
  type ArchiveImpact,
  archiveImpact,
  archiveRecord,
  unarchiveRecord,
} from '@muni/db/repositories'
import { ARCHIVABLE, type Archivable } from '@muni/domain/archive'

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
  return then ? { status: 'done', href: then } : { status: 'done' }
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
    switch (outcome.reason) {
      case 'TAKEN':
        return { status: 'refused', reason: 'taken', fields: outcome.fields }
      case 'SESSION':
        return {
          status: 'refused',
          reason: outcome.problem === 'ROOM_BUSY' ? 'room_busy' : 'room_unfit',
        }
      case 'NOT_FOUND':
        return { status: 'refused', reason: 'not_found' }
      case 'PARENT_ARCHIVED':
        return { status: 'refused', reason: 'parent_archived' }
    }
  }
  return then ? { status: 'done', href: then } : { status: 'done' }
}
