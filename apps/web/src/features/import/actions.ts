'use server'

import { getDb } from '@muni/db/client'
import { COMMIT_CHUNK_SIZE, commitChunk, CommitValidationError } from '@muni/db/writer'
import { DATASET_KINDS, type DatasetKind } from '@muni/importer'
import { revalidatePath } from 'next/cache'

import { requireUser } from '@/server/auth'

export type CommitChunkResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: 'unauthorized' | 'invalid' | 'failed'; detail?: string }

/**
 * Writes one chunk of validated records. The browser did the parsing and review; the server
 * re-validates every record against the domain schema before writing (see commitChunk).
 */
export async function commitImportChunk(
  kind: DatasetKind,
  records: unknown[]
): Promise<CommitChunkResult> {
  try {
    await requireUser()
  } catch {
    return { ok: false, error: 'unauthorized' }
  }
  if (
    !DATASET_KINDS.includes(kind) ||
    !Array.isArray(records) ||
    records.length > COMMIT_CHUNK_SIZE
  ) {
    return { ok: false, error: 'invalid' }
  }
  try {
    const result = await commitChunk(getDb(), kind, records)
    revalidatePath('/', 'layout')
    return { ok: true, ...result }
  } catch (error) {
    if (error instanceof CommitValidationError) {
      return {
        ok: false,
        error: 'invalid',
        detail: `#${error.index}: ${error.issues.map(i => i.message).join(', ')}`,
      }
    }
    console.error(error)
    return { ok: false, error: 'failed' }
  }
}
