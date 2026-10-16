'use client'

import {
  COMMIT_ORDER,
  committable,
  summarize,
  type ImportBatch,
  type ParsedRow,
} from '@muni/importer'
import { Alert } from '@muni/ui/alert'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { ArrowLeft, Play } from 'lucide-react'

import { useImportText } from './use-issue-text'

export function ConfirmStep({
  batch,
  onBack,
  onStart,
}: {
  batch: ImportBatch
  onBack: () => void
  onStart: () => void
}) {
  const { t } = useImportText()
  const kinds = COMMIT_ORDER.filter(kind => (batch[kind]?.length ?? 0) > 0)
  const total = kinds.reduce((sum, kind) => sum + committable(batch, kind).length, 0)
  const skipped = kinds.reduce(
    (sum, kind) => sum + summarize((batch[kind] ?? []) as ParsedRow<unknown>[]).invalid,
    0
  )

  return (
    <Card className="max-w-2xl">
      <CardHeader title={t('confirm.title')} />
      <CardBody className="flex flex-col gap-3 text-sm">
        <ul className="flex flex-col gap-1">
          {kinds.map(kind => (
            <li key={kind}>
              {t('confirm.summary', {
                kind: t(`kinds.${kind}`),
                count: committable(batch, kind).length,
              })}
            </li>
          ))}
        </ul>
        {skipped > 0 && (
          <Alert tone="warning" variant="inline" role="none">
            {t('confirm.skipped', { count: skipped })}
          </Alert>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={onBack}>
            <ArrowLeft aria-hidden />
            {t('confirm.back')}
          </Button>
          <Button variant="primary" disabled={total === 0} onClick={onStart}>
            <Play aria-hidden />
            {t('confirm.start', { count: total })}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
