'use server'

import { getDb } from '@muni/db/client'
import { findArchivedKeys } from '@muni/db/reference'
import {
  COMMIT_CHUNK_SIZE,
  commitChunk,
  CommitRefusedError,
  CommitValidationError,
} from '@muni/db/writer'
import { type ArchivedKeys, DATASET_KINDS, type DatasetKind, NO_ARCHIVED } from '@muni/importer'
import * as z from 'zod'

import { asAdmin, type Denied, logFailure } from '@/server/actions/guard'

export type CommitChunkResult =
  | { ok: true; created: number; updated: number; skipped: number }
  | {
      ok: false
      error: Denied | 'invalid' | 'room_busy' | 'room_unfit' | 'failed'
      detail?: string
    }

/**
 * Writes one chunk of validated records. The browser did the parsing and review; the server
 * re-validates every record against the domain schema before writing (see commitChunk).
 */
export async function commitImportChunk(
  kind: DatasetKind,
  records: unknown[]
): Promise<CommitChunkResult> {
  if (
    !DATASET_KINDS.includes(kind) ||
    !Array.isArray(records) ||
    records.length > COMMIT_CHUNK_SIZE
  ) {
    return { ok: false, error: 'invalid' }
  }
  return asAdmin<CommitChunkResult>(
    async () => ({ ok: true, ...(await commitChunk(getDb(), kind, records)) }),
    {
      denied: error => ({ ok: false, error }),
      failed: error => {
        if (error instanceof CommitValidationError) {
          return {
            ok: false,
            error: 'invalid',
            detail: `#${error.index}: ${error.issues.map(i => i.message).join(', ')}`,
          }
        }
        if (error instanceof CommitRefusedError) {
          return {
            ok: false,
            error: error.reason === 'ROOM_BUSY' ? 'room_busy' : 'room_unfit',
            detail: `#${error.index}: ${error.key}`,
          }
        }
        logFailure(error)
        return { ok: false, error: 'failed' }
      },
    }
  )
}

const keys = z.array(z.string().max(500)).max(50_000)
const candidatesSchema = z.object({
  courses: keys,
  employees: keys,
  employeeEmails: keys,
  departments: keys,
  positions: keys,
  providers: keys,
  rooms: keys,
  sessions: keys,
  completions: keys,
})

/**
 * Which of the batch's own keys only archived records hold, so the review can show those rows
 * as skipped. Nothing else about archived records is sent back.
 */
export async function findArchived(candidates: ArchivedKeys): Promise<ArchivedKeys> {
  return asAdmin(
    async () => {
      const parsed = candidatesSchema.safeParse(candidates)
      return parsed.success ? findArchivedKeys(getDb(), parsed.data) : NO_ARCHIVED
    },
    {
      denied: () => NO_ARCHIVED,
      failed: error => {
        logFailure(error)
        return NO_ARCHIVED
      },
    }
  )
}
