'use client'

import { type DatasetKind, type ImportBatch, type ParsedRow, summarize } from '@muni/importer'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@muni/ui/tabs'
import { formatInteger } from '@muni/utils/format'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CircleX,
  DoorOpen,
  GraduationCap,
  type LucideIcon,
  Users,
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { useState } from 'react'

import { DatasetReview } from './dataset-review'
import { useImportText } from './use-issue-text'

const KIND_ICON: Record<DatasetKind, LucideIcon> = {
  rooms: DoorOpen,
  courses: BookOpen,
  employees: Users,
  sessions: CalendarDays,
  completions: GraduationCap,
}

export function ReviewStep({
  batch,
  columnsByKind,
  onEdit,
  onRemoved,
  onRevert,
  onBack,
  onNext,
}: {
  batch: ImportBatch
  columnsByKind: Partial<Record<DatasetKind, string[]>>
  onEdit: (kind: DatasetKind, index: number, field: string, value: string) => void
  onRemoved: (kind: DatasetKind, index: number, removed: boolean) => void
  onRevert: (kind: DatasetKind, index: number) => void
  onBack: () => void
  onNext: () => void
}) {
  const { t } = useImportText()
  const locale = useLocale()
  // The datasets with rows, in the batch's order.
  const datasets = (Object.keys(batch) as DatasetKind[]).flatMap(kind => {
    const rows = (batch[kind] ?? []) as ParsedRow<unknown>[]
    return rows.length > 0 ? [{ kind, rows }] : []
  })
  const [tab, setTab] = useState<string>(datasets[0]?.kind ?? 'courses')

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {datasets.map(({ kind, rows }) => {
            const s = summarize(rows)
            const Icon = KIND_ICON[kind]
            return (
              <TabsTrigger key={kind} value={kind}>
                <Icon aria-hidden />
                {t(`kinds.${kind}`)}
                <Badge>
                  <span aria-hidden>{formatInteger(s.total, locale)}</span>
                  <span className="sr-only">{t('review.tabCount', { total: s.total })}</span>
                </Badge>
                {s.invalid > 0 && (
                  <Badge tone="danger">
                    <CircleX aria-hidden />
                    <span aria-hidden>{formatInteger(s.invalid, locale)}</span>
                    <span className="sr-only">{t('review.tabInvalid', { count: s.invalid })}</span>
                  </Badge>
                )}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {datasets.map(({ kind, rows }) => (
          <TabsContent key={kind} value={kind}>
            <DatasetReview
              name={t(`kinds.${kind}`)}
              columns={columnsByKind[kind] ?? []}
              rows={rows}
              onEdit={(index, field, value) => {
                onEdit(kind, index, field, value)
              }}
              onRemove={index => {
                onRemoved(kind, index, true)
              }}
              onRestore={index => {
                onRemoved(kind, index, false)
              }}
              onRevert={index => {
                onRevert(kind, index)
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
      <div className="flex justify-end gap-2">
        <Button onClick={onBack}>
          <ArrowLeft aria-hidden />
          {t('review.back')}
        </Button>
        <Button variant="primary" onClick={onNext}>
          {t('review.next')}
          <ArrowRight aria-hidden />
        </Button>
      </div>
    </div>
  )
}
