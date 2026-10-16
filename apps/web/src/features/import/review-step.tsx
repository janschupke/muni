'use client'

import { summarize, type DatasetKind, type ImportBatch, type ParsedRow } from '@muni/importer'
import { Button } from '@muni/ui/button'
import { StatCard } from '@muni/ui/stat-card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@muni/ui/tabs'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import { ReviewTable, type IndexedRow } from './review-table'
import { useImportText } from './use-issue-text'

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
  const tc = useTranslations('common')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const summary = summarize(rows)
  const filtered = useMemo<IndexedRow[]>(
    () => rows.flatMap((row, index) => (matches(row, filter) ? [{ index, row }] : [])),
    [rows, filter]
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, pageCount - 1)
  const choose = (next: Filter) => {
    setFilter(prev => (prev === next ? 'all' : next))
    setPage(0)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard
          label={t('review.total')}
          value={summary.total}
          onClick={() => {
            choose('all')
          }}
          pressed={filter === 'all'}
        />
        <StatCard
          label={t('review.valid')}
          value={summary.valid}
          tone="success"
          onClick={() => {
            choose('valid')
          }}
          pressed={filter === 'valid'}
        />
        <StatCard
          label={t('review.invalid')}
          value={summary.invalid}
          tone="danger"
          onClick={() => {
            choose('errors')
          }}
          pressed={filter === 'errors'}
        />
        <StatCard
          label={t('review.warnings')}
          value={summary.warnings}
          tone="warning"
          onClick={() => {
            choose('warnings')
          }}
          pressed={filter === 'warnings'}
        />
        <StatCard
          label={t('review.removed')}
          value={summary.removed}
          onClick={() => {
            choose('removed')
          }}
          pressed={filter === 'removed'}
        />
      </div>
      <p className="text-xs text-fg-subtle">{t('review.filterHint')}</p>
      {summary.invalid > 0 && (
        <p
          role="status"
          className="rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-sm text-warning-fg"
        >
          {t('review.invalidNotice', { count: summary.invalid })}
        </p>
      )}
      <ReviewTable
        columns={columns}
        rows={filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)}
        onEdit={onEdit}
        onRemove={onRemove}
        onRestore={onRestore}
        onRevert={onRevert}
      />
      {pageCount > 1 && (
        <div className="flex items-center justify-between text-sm text-fg-muted">
          <Button
            size="sm"
            disabled={current === 0}
            onClick={() => {
              setPage(current - 1)
            }}
          >
            {tc('previous')}
          </Button>
          <span>{tc('page', { page: current + 1, pageCount })}</span>
          <Button
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => {
              setPage(current + 1)
            }}
          >
            {tc('next')}
          </Button>
        </div>
      )}
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
            return (
              <TabsTrigger key={kind} value={kind}>
                {t(`kinds.${kind}`)}
                <span className="rounded-sm bg-surface-sunken px-1.5 text-xs tabular-nums">
                  {s.total}
                </span>
                {s.invalid > 0 && (
                  <span className="rounded-sm bg-danger-soft px-1.5 text-xs text-danger-fg tabular-nums">
                    {s.invalid}
                  </span>
                )}
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
        <Button onClick={onBack}>{t('review.back')}</Button>
        <Button variant="primary" onClick={onNext}>
          {t('review.next')}
        </Button>
      </div>
    </div>
  )
}
