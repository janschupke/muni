'use client'

import {
  archivedCandidates,
  type ArchivedKeys,
  type DatasetKind,
  editCell,
  type ImportBatch,
  MAX_FILE_BYTES,
  NO_ARCHIVED,
  type ParsedFile,
  parseFile,
  type ReferenceSnapshot,
  revertRow,
  setRemoved,
  validateBatch,
} from '@muni/importer'
import { useState, useTransition } from 'react'

import { findArchived } from '@/server/actions/import'

import type { RejectedFile } from './upload-step'

type Files = Partial<Record<DatasetKind, ParsedFile>>

function batchFrom(files: Files): ImportBatch {
  const batch: Record<string, unknown> = {}
  for (const [kind, file] of Object.entries(files)) batch[kind] = file.rows
  return batch
}

/**
 * The files an import reads and the batch they make, validated in the browser with the same
 * @muni/importer the seed uses. Adding files asks the server which of their keys only archived
 * records hold; edits, removals and reverts re-validate the whole batch.
 */
export function useImportFiles(snapshot: ReferenceSnapshot, today: string) {
  const [archived, setArchived] = useState<ArchivedKeys>(NO_ARCHIVED)
  const [files, setFiles] = useState<Files>({})
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [batch, setBatch] = useState<ImportBatch>({})
  const [, startTransition] = useTransition()
  const reference = { ...snapshot, archived }
  const ctx = { today }

  const add = async (incoming: File[]) => {
    const next = { ...files }
    const failed: RejectedFile[] = []
    for (const file of incoming) {
      if (file.size > MAX_FILE_BYTES) {
        failed.push({ fileName: file.name, error: 'TOO_LARGE', missingColumns: [] })
        continue
      }
      const parsed = parseFile(file.name, new Uint8Array(await file.arrayBuffer()), ctx)
      if (parsed.kind && !parsed.error) next[parsed.kind] = parsed
      else
        failed.push({
          fileName: parsed.fileName,
          error: parsed.error ?? 'UNRECOGNIZED_FILE',
          missingColumns: parsed.missingColumns,
        })
    }
    const parsed = batchFrom(next)
    // Unreachable: no row is marked archived here; the server still skips them when writing.
    const keys = await findArchived(archivedCandidates(parsed)).catch(() => NO_ARCHIVED)
    setArchived(keys)
    setFiles(next)
    setRejected(failed)
    setBatch(validateBatch(parsed, { ...snapshot, archived: keys }))
  }

  const remove = (kind: DatasetKind) => {
    const next = Object.fromEntries(Object.entries(files).filter(([k]) => k !== kind)) as Files
    setFiles(next)
    setBatch(validateBatch(batchFrom(next), reference))
  }

  const update = (fn: (b: ImportBatch) => ImportBatch) => {
    startTransition(() => {
      setBatch(fn)
    })
  }

  const columnsByKind: Partial<Record<DatasetKind, string[]>> = {}
  for (const file of Object.values(files)) if (file.kind) columnsByKind[file.kind] = file.columns

  return {
    files,
    rejected,
    batch,
    columnsByKind,
    add,
    remove,
    editCell: (kind: DatasetKind, index: number, field: string, value: string) => {
      update(b => editCell(b, kind, index, field, value, ctx, reference))
    },
    setRemoved: (kind: DatasetKind, index: number, removed: boolean) => {
      update(b => setRemoved(b, kind, index, removed, reference))
    },
    revert: (kind: DatasetKind, index: number) => {
      update(b => revertRow(b, kind, index, ctx, reference))
    },
    reset: () => {
      setFiles({})
      setRejected([])
      setBatch({})
    },
  }
}
