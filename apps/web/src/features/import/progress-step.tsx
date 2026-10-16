'use client'

import type { DatasetKind } from '@muni/importer'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { Meter } from '@muni/ui/meter'
import { CircleCheck, TriangleAlert } from 'lucide-react'

import { useImportText } from './use-issue-text'

export type ImportJob =
  | { status: 'running'; done: number; total: number }
  | {
      status: 'succeeded'
      total: number
      results: Partial<Record<DatasetKind, { created: number; updated: number }>>
    }
  | { status: 'failed'; total: number; written: number; message: string }

export function ProgressStep({ job, onReset }: { job: ImportJob; onReset: () => void }) {
  const { t } = useImportText()
  if (job.status === 'running') {
    return (
      <Card className="max-w-2xl">
        <CardBody className="flex flex-col gap-2" aria-live="polite">
          <Meter value={job.done} max={job.total} label={t('steps.done')} className="h-2" />
          <p className="text-sm text-fg-muted">
            {t('progress.running', { done: job.done, total: job.total })}
          </p>
        </CardBody>
      </Card>
    )
  }
  if (job.status === 'failed') {
    return (
      <Card className="max-w-2xl">
        <CardBody className="flex flex-col gap-3 text-sm" role="alert">
          <p className="flex items-center gap-2 font-medium text-danger-fg">
            <TriangleAlert aria-hidden className="size-4" />
            {t('progress.failed', { message: job.message })}
          </p>
          {job.written > 0 && (
            <p className="text-fg-muted">{t('progress.partial', { count: job.written })}</p>
          )}
          <div>
            <Button onClick={onReset}>{t('progress.again')}</Button>
          </div>
        </CardBody>
      </Card>
    )
  }
  return (
    <Card className="max-w-2xl">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <CircleCheck aria-hidden className="size-5 text-success-fg" />
            {t('progress.doneTitle')}
          </span>
        }
      />
      <CardBody className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1">
          {(
            Object.entries(job.results) as [DatasetKind, { created: number; updated: number }][]
          ).map(([kind, r]) => (
            <li key={kind}>
              {t('progress.result', {
                kind: t(`kinds.${kind}`),
                created: r.created,
                updated: r.updated,
              })}
            </li>
          ))}
        </ul>
        <div>
          <Button variant="primary" onClick={onReset}>
            {t('progress.again')}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
