'use client'

import {
  COMMIT_ORDER,
  committable,
  summarize,
  type ImportBatch,
  type ParsedRow,
} from '@muni/importer'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'

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
          <p className="text-warning-fg">{t('confirm.skipped', { count: skipped })}</p>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={onBack}>{t('confirm.back')}</Button>
          <Button variant="primary" disabled={total === 0} onClick={onStart}>
            {t('confirm.start', { count: total })}
          </Button>
        </div>
      </CardBody>
    </Card>
  )
}
