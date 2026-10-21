'use server'

import { getDb } from '@muni/db/client'
import { findArchivedKeys } from '@muni/db/reference'
import {
  commitChunk,
  type CommitRefusal,
  CommitRefusedError,
  CommitValidationError,
} from '@muni/db/writer'
import {
  type ArchivedKeys,
  COMMIT_CHUNK_SIZE,
  DATASET_KINDS,
  type DatasetKind,
  NO_ARCHIVED,
} from '@muni/importer'
import * as z from 'zod'

import { asAdmin, type Denied, logFailure } from '@/server/actions/guard'

/** What a chunk wrote: records created, changed, already as they are, and left alone. */
export interface CommitCounts {
  created: number
  updated: number
  unchanged: number
  skipped: number
}

export type CommitChunkResult =
  | ({ ok: true } & CommitCounts)
  | {
      ok: false
      error: Denied | 'invalid' | Lowercase<CommitRefusal> | 'failed'
      detail?: string
    }

/**
 * Writes one chunk of validated records. The browser did the parsing and review; the server
 * re-validates every record against the domain schema before writing (see commitChunk).
 * `last` marks the dataset's final chunk, after which what needs all of it is worked out.
 */
export async function commitImportChunk(
  kind: DatasetKind,
  records: unknown[],
  last: boolean
): Promise<CommitChunkResult> {
  if (
    !DATASET_KINDS.includes(kind) ||
    !Array.isArray(records) ||
    records.length > COMMIT_CHUNK_SIZE ||
    typeof last !== 'boolean'
  ) {
    return { ok: false, error: 'invalid' }
  }
  return asAdmin<CommitChunkResult>(
    async () => ({ ok: true, ...(await commitChunk(getDb(), kind, records, { last })) }),
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
            error: error.reason.toLowerCase() as Lowercase<CommitRefusal>,
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
