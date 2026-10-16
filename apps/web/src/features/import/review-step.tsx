'use client'

import { summarize, type DatasetKind, type ImportBatch, type ParsedRow } from '@muni/importer'
import { Alert } from '@muni/ui/alert'
import { Badge } from '@muni/ui/badge'
import { Button } from '@muni/ui/button'
import { Hint } from '@muni/ui/field'
import { StatCard } from '@muni/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@muni/ui/tabs'
import { formatInteger } from '@muni/utils/format'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  GraduationCap,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { useMemo, useState } from 'react'

import { ReviewTable, type IndexedRow } from './review-table'
import { useImportText } from './use-issue-text'

const KIND_ICON: Record<DatasetKind, LucideIcon> = {
  courses: BookOpen,
  employees: Users,
  sessions: CalendarDays,
  completions: GraduationCap,
}

type Filter = 'all' | 'valid' | 'errors' | 'warnings' | 'removed'
const PAGE_SIZE = 50

function matches(row: ParsedRow<unknown>, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'valid':
      return row.isValid && !row.isRemoved
    case 'errors':
      return !row.isValid && !row.isRemoved
    case 'warnings':
      return row.isValid && !row.isRemoved && row.warnings.length > 0
    case 'removed':
      return row.isRemoved
  }
}

function DatasetReview({
  columns,
  rows,
  onEdit,
  onRemove,
  onRestore,
  onRevert,
}: {
  columns: string[]
  rows: ParsedRow<unknown>[]
  onEdit: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  onRestore: (index: number) => void
  onRevert: (index: number) => void
}) {
  const { t } = useImportText()
  const locale = useLocale()
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const summary = summarize(rows)
  const filtered = useMemo<IndexedRow[]>(
    () => rows.flatMap((row, index) => (matches(row, filter) ? [{ index, row }] : [])),
    [rows, filter]
  )
  // Removing rows under a filter can shrink the last page away; stay on the last one left.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const choose = (next: Filter) => {
    setFilter(prev => (prev === next ? 'all' : next))
    setPage(0)
  }
  const count = (value: number) => formatInteger(value, locale)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label={t('review.total')}
          value={count(summary.total)}
          onClick={() => {
            choose('all')
          }}
          pressed={filter === 'all'}
        />
        <StatCard
          label={t('review.valid')}
          value={count(summary.valid)}
          tone="success"
          onClick={() => {
            choose('valid')
          }}
          pressed={filter === 'valid'}
        />
        <StatCard
          label={t('review.invalid')}
          value={count(summary.invalid)}
          tone="danger"
          onClick={() => {
            choose('errors')
          }}
          pressed={filter === 'errors'}
        />
        <StatCard
          label={t('review.warnings')}
          value={count(summary.warnings)}
          tone="warning"
          onClick={() => {
            choose('warnings')
          }}
          pressed={filter === 'warnings'}
        />
        <StatCard
          label={t('review.removed')}
          value={count(summary.removed)}
          onClick={() => {
            choose('removed')
          }}
          pressed={filter === 'removed'}
        />
      </div>
      <Hint>{t('review.filterHint')}</Hint>
      {summary.invalid > 0 && (
        <Alert tone="warning">{t('review.invalidNotice', { count: summary.invalid })}</Alert>
      )}
      <ReviewTable
        columns={columns}
        rows={filtered}
        pagination={{ pageIndex: current, pageSize: PAGE_SIZE }}
        onPaginationChange={next => {
          setPage(next.pageIndex)
        }}
        onEdit={onEdit}
        onRemove={onRemove}
        onRestore={onRestore}
        onRevert={onRevert}
      />
    </div>
  )
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
                <Badge>{s.total}</Badge>
                {s.invalid > 0 && <Badge tone="danger">{s.invalid}</Badge>}
              </TabsTrigger>
            )
          })}
        </TabsList>
        {kinds.map(kind => (
          <TabsContent key={kind} value={kind}>
            <DatasetReview
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
      <div className="flex gap-2">
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
