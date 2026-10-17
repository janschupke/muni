'use client'

import type { DatasetKind } from '@muni/importer'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Card, CardBody } from '@muni/ui/card'
import { Meter } from '@muni/ui/meter'
import { RotateCcw } from 'lucide-react'

import { useImportText } from './use-issue-text'

export type ImportJob =
  | { status: 'running'; done: number; total: number }
  | {
      status: 'succeeded'
      total: number
      results: Partial<Record<DatasetKind, { created: number; updated: number; skipped: number }>>
    }
  | { status: 'failed'; total: number; written: number; message: string }

export function ProgressStep({ job, onReset }: { job: ImportJob; onReset: () => void }) {
  const { t } = useImportText()
  // One status region for the whole run, so each change (progress, then the outcome) is
  // announced: a region that appears with its text is often not.
  const status =
    job.status === 'running'
      ? t('progress.running', { done: job.done, total: job.total })
      : job.status === 'failed'
        ? t('progress.failed', { message: job.message })
        : t('progress.doneTitle')
  return (
    <Card>
      <CardBody className="flex flex-col gap-3 text-sm">
        <p role="status" className="sr-only">
          {status}
        </p>
        {job.status === 'running' && (
          <div aria-hidden className="flex flex-col gap-2">
            <Meter value={job.done} max={job.total} label={t('progress.meter')} size="md" />
            <p className="text-fg-muted">{status}</p>
          </div>
        )}
        {job.status === 'failed' && (
          <>
            {/* Shown; the status region above is what is read out. */}
            <div aria-hidden>
              <Alert tone="danger" variant="inline" role="none">
                {status}
              </Alert>
            </div>
            {job.written > 0 && (
              <p className="text-fg-muted">{t('progress.partial', { count: job.written })}</p>
            )}
            <div>
              <Button onClick={onReset}>
                <RotateCcw aria-hidden />
                {t('progress.again')}
              </Button>
            </div>
          </>
        )}
        {job.status === 'succeeded' && (
          <>
            <div aria-hidden>
              <Alert tone="success" variant="inline" className="text-base" role="none">
                {status}
              </Alert>
            </div>
            <ul className="flex flex-col gap-1">
              {(
                Object.entries(job.results) as [
                  DatasetKind,
                  { created: number; updated: number; skipped: number },
                ][]
              ).map(([kind, r]) => (
                <li key={kind}>
                  {t('progress.result', {
                    kind: t(`kinds.${kind}`),
                    created: r.created,
                    updated: r.updated,
                    skipped: r.skipped,
                  })}
                </li>
              ))}
            </ul>
            <div>
              <Button variant="primary" onClick={onReset}>
                <RotateCcw aria-hidden />
                {t('progress.again')}
              </Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}
