'use client'

import {
  COMMIT_CHUNK_SIZE as CHUNK,
  COMMIT_ORDER,
  committable,
  countCommittable,
  type DatasetKind,
  type ImportBatch,
} from '@muni/importer'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import { useAfterWrite } from '@/lib/query/use-after-write'
import { type CommitCounts, commitImportChunk } from '@/server/actions/import'

import type { ImportJob } from './progress-step'

type Results = Partial<Record<DatasetKind, CommitCounts>>

/**
 * Writes a batch in commit order, a chunk at a time, reporting progress as it goes. The first
 * chunk the server refuses (or cannot be reached for) stops it, saying how much was written.
 */
export function useChunkedImport() {
  const tp = useTranslations('import.progress')
  const afterWrite = useAfterWrite('import')
  const [job, setJob] = useState<ImportJob | null>(null)

  const run = async (batch: ImportBatch) => {
    const kinds = COMMIT_ORDER.filter(kind => (batch[kind]?.length ?? 0) > 0)
    const total = countCommittable(batch)
    const results: Results = {}
    let done = 0
    setJob({ status: 'running', done, total })
    for (const kind of kinds) {
      const records = committable(batch, kind)
      for (let i = 0; i < records.length; i += CHUNK) {
        const last = i + CHUNK >= records.length
        const result = await commitImportChunk(kind, records.slice(i, i + CHUNK), last).catch(
          () => ({
            ok: false as const,
            error: 'network' as const,
            detail: undefined,
          })
        )
        if (!result.ok) {
          const reason = tp(`errors.${result.error}`)
          const message = result.detail ? `${reason} (${result.detail})` : reason
          setJob({ status: 'failed', total, written: done, message })
          afterWrite()
          return
        }
        const sum = results[kind] ?? { created: 0, updated: 0, unchanged: 0, skipped: 0 }
        results[kind] = {
          created: sum.created + result.created,
          updated: sum.updated + result.updated,
          unchanged: sum.unchanged + result.unchanged,
          skipped: sum.skipped + result.skipped,
        }
        done += Math.min(CHUNK, records.length - i)
        setJob({ status: 'running', done, total })
      }
    }
    setJob({ status: 'succeeded', total, results })
    afterWrite()
  }

  return {
    job,
    run,
    clear: () => {
      setJob(null)
    },
  }
}
