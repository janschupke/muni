'use server'

import {
  type ArchiveImpact,
  archiveImpact,
  archiveRecord,
  unarchiveRecord,
} from '@muni/db/repositories'
import { ARCHIVABLE, type Archivable } from '@muni/domain/archive'

import { archiveRefused, type ArchiveState } from '@/lib/form/form'
import { isLocalHref } from '@/lib/navigation/local-href'

import { asAdmin, type Denied, isBoundId, logFailure } from './guard'

// Archiving and bringing back, for every kind of record. Bound arguments reach the browser and
// come back from it, so each is checked here.

function checked(kind: Archivable, id: string, then: string | null) {
  if (!ARCHIVABLE.includes(kind) || !isBoundId(id)) return false
  // Only a path in this app: never another origin.
  return then === null || (typeof then === 'string' && isLocalHref(then))
}

const refusal = {
  denied: (why: Denied): ArchiveState => ({ status: 'refused', reason: why }),
  failed: (error: unknown): ArchiveState => {
    logFailure(error)
    return { status: 'refused', reason: 'generic' }
  },
}

/** What archiving would do now, for the confirm dialog. Null for anyone but an admin. */
export async function previewArchive(kind: Archivable, id: string): Promise<ArchiveImpact | null> {
  if (!checked(kind, id, null)) return null
  return asAdmin(() => archiveImpact(kind, id), {
    denied: () => null,
    failed: error => {
      logFailure(error)
      return null
    },
  })
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
  return asAdmin(async admin => {
    const impact = await archiveRecord(kind, id, admin.id)
    if (!impact.ok) return archiveRefused(impact.reason, impact.count)
    return then ? { status: 'done', href: then } : { status: 'done' }
  }, refusal)
}

/** Brings an archived record back, then shows `then` (or stays, reporting `done`). */
export async function unarchiveAction(
  kind: Archivable,
  id: string,
  then: string | null,
  _state: ArchiveState
): Promise<ArchiveState> {
  if (!checked(kind, id, then)) return { status: 'refused', reason: 'generic' }
  return asAdmin(async (): Promise<ArchiveState> => {
    const outcome = await unarchiveRecord(kind, id)
    if (outcome.ok) return then ? { status: 'done', href: then } : { status: 'done' }
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
  }, refusal)
}
