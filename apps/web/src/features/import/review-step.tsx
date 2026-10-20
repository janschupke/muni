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
  const kinds = (Object.keys(batch) as DatasetKind[]).filter(k => (batch[k]?.length ?? 0) > 0)
  const [tab, setTab] = useState<string>(kinds[0] ?? 'courses')

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {kinds.map(kind => {
            const s = summarize(batch[kind] ?? [])
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
        {kinds.map(kind => (
          <TabsContent key={kind} value={kind}>
            <DatasetReview
              name={t(`kinds.${kind}`)}
              columns={columnsByKind[kind] ?? []}
              rows={(batch[kind] ?? []) as ParsedRow<unknown>[]}
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
