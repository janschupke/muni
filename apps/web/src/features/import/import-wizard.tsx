'use client'

import {
  archivedCandidates,
  type ArchivedKeys,
  COMMIT_ORDER,
  committable,
  countCommittable,
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
import { StepIndicator } from '@muni/ui/step-indicator'
import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition } from 'react'

import { useAfterWrite } from '@/lib/query/use-after-write'
import { commitImportChunk, findArchived } from '@/server/actions/import'

import { ConfirmStep } from './confirm-step'
import { type ImportJob, ProgressStep } from './progress-step'
import { type RejectedFile, UploadStep } from './upload-step'
import { useImportText } from './use-issue-text'

// Loaded when needed: the review's table, once files are read.
const ReviewStep = dynamic(() => import('./review-step').then(m => m.ReviewStep))

const CHUNK = 500

function batchFrom(files: Partial<Record<DatasetKind, ParsedFile>>): ImportBatch {
  const batch: Record<string, unknown> = {}
  for (const [kind, file] of Object.entries(files)) batch[kind] = file.rows
  return batch
}

/**
 * The ceum import flow: upload → review → confirm → progress. Parsing and validation run in
 * the browser with the same @muni/importer the seed uses; the server re-validates each chunk.
 */
export function ImportWizard({
  reference: snapshot,
  today,
}: {
  reference: ReferenceSnapshot
  today: string
}) {
  // The server says which of the files' keys are archived, once they are known.
  const [archived, setArchived] = useState<ArchivedKeys>(NO_ARCHIVED)
  const reference = { ...snapshot, archived }
  const { t } = useImportText()
  const afterWrite = useAfterWrite('import')
  const tp = useTranslations('import.progress')
  const ctx = { today }
  const [step, setStep] = useState(0)
  const stepHeading = useRef<HTMLHeadingElement>(null)
  const firstStep = useRef(true)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false
      return
    }
    stepHeading.current?.focus()
  }, [step])
  const [files, setFiles] = useState<Partial<Record<DatasetKind, ParsedFile>>>({})
  const [rejected, setRejected] = useState<RejectedFile[]>([])
  const [batch, setBatch] = useState<ImportBatch>({})
  const [job, setJob] = useState<ImportJob | null>(null)
  const [, startTransition] = useTransition()

  const addFiles = async (incoming: File[]) => {
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

  const removeFile = (kind: DatasetKind) => {
    const next = Object.fromEntries(Object.entries(files).filter(([k]) => k !== kind)) as Partial<
      Record<DatasetKind, ParsedFile>
    >
    setFiles(next)
    setBatch(validateBatch(batchFrom(next), reference))
  }

  const update = (fn: (b: ImportBatch) => ImportBatch) => {
    startTransition(() => {
      setBatch(fn)
    })
  }

  const run = async () => {
    const kinds = COMMIT_ORDER.filter(kind => (batch[kind]?.length ?? 0) > 0)
    const total = countCommittable(batch)
    const results: Partial<
      Record<DatasetKind, { created: number; updated: number; skipped: number }>
    > = {}
    let done = 0
    setStep(3)
    setJob({ status: 'running', done, total })
    for (const kind of kinds) {
      const records = committable(batch, kind)
      for (let i = 0; i < records.length; i += CHUNK) {
        const result = await commitImportChunk(kind, records.slice(i, i + CHUNK)).catch(() => ({
          ok: false as const,
          error: 'network' as const,
          detail: undefined,
        }))
        if (!result.ok) {
          const reason = tp(`errors.${result.error}`)
          const message = result.detail ? `${reason} (${result.detail})` : reason
          setJob({ status: 'failed', total, written: done, message })
          afterWrite()
          return
        }
        const sum = results[kind] ?? { created: 0, updated: 0, skipped: 0 }
        results[kind] = {
          created: sum.created + result.created,
          updated: sum.updated + result.updated,
          skipped: sum.skipped + result.skipped,
        }
        done += Math.min(CHUNK, records.length - i)
        setJob({ status: 'running', done, total })
      }
    }
    setJob({ status: 'succeeded', total, results })
    afterWrite()
  }

  const reset = () => {
    setFiles({})
    setRejected([])
    setBatch({})
    setJob(null)
    setStep(0)
  }

  const steps = [t('steps.upload'), t('steps.review'), t('steps.confirm'), t('steps.done')]
  const columnsByKind: Partial<Record<DatasetKind, string[]>> = {}
  for (const file of Object.values(files)) {
    if (file.kind) columnsByKind[file.kind] = file.columns
  }

  return (
    <div className="flex flex-col gap-6">
      <StepIndicator steps={steps} current={step} />
      {/* Each step is named, and a new step takes the focus: the button that led to it is gone. */}
      <h2 ref={stepHeading} tabIndex={-1} className="sr-only">
        {t('stepHeading', { step: step + 1, count: steps.length, name: steps[step] ?? '' })}
      </h2>
      {step === 0 && (
        <UploadStep
          files={files}
          rejected={rejected}
          onFiles={incoming => {
            void addFiles(incoming)
          }}
          onRemove={removeFile}
          onNext={() => {
            setStep(1)
          }}
        />
      )}
      {step === 1 && (
        <ReviewStep
          batch={batch}
          columnsByKind={columnsByKind}
          onEdit={(kind, index, field, value) => {
            update(b => editCell(b, kind, index, field, value, ctx, reference))
          }}
          onRemoved={(kind, index, removed) => {
            update(b => setRemoved(b, kind, index, removed, reference))
          }}
          onRevert={(kind, index) => {
            update(b => revertRow(b, kind, index, ctx, reference))
          }}
          onBack={() => {
            setStep(0)
          }}
          onNext={() => {
            setStep(2)
          }}
        />
      )}
      {step === 2 && (
        <ConfirmStep
          batch={batch}
          onBack={() => {
            setStep(1)
          }}
          onStart={() => {
            void run()
          }}
        />
      )}
      {step === 3 && job && <ProgressStep job={job} onReset={reset} />}
    </div>
  )
}
