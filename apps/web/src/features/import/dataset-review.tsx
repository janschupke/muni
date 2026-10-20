'use client'

import { type ParsedRow, rowState, summarize } from '@muni/importer'
import { Alert } from '@muni/ui/alert'
import { Hint } from '@muni/ui/field'
import { StatCard } from '@muni/ui/stat-card'
import { formatInteger } from '@muni/utils/format'
import { useLocale } from 'next-intl'
import { useMemo } from 'react'

import { useFilteredPage } from '@/lib/use-filtered-page'

import { type IndexedRow, ReviewTable } from './review-table'
import { useImportText } from './use-issue-text'

type Filter = 'all' | 'valid' | 'errors' | 'warnings' | 'skipped' | 'removed'

const PAGE_SIZE = 50

function matches(row: ParsedRow<unknown>, filter: Filter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'valid':
      return rowState(row) === 'VALID'
    case 'errors':
      return rowState(row) === 'INVALID'
    case 'warnings':
      return rowState(row) === 'VALID' && row.warnings.length > 0
    case 'skipped':
      return rowState(row) === 'SKIPPED'
    case 'removed':
      return rowState(row) === 'REMOVED'
  }
}

export function DatasetReview({
  name,
  columns,
  rows,
  onEdit,
  onRemove,
  onRestore,
  onRevert,
}: {
  name: string
  columns: string[]
  rows: ParsedRow<unknown>[]
  onEdit: (index: number, field: string, value: string) => void
  onRemove: (index: number) => void
  onRestore: (index: number) => void
  onRevert: (index: number) => void
}) {
  const { t } = useImportText()
  const locale = useLocale()
  const { filter, choose, filtered, page, setPage } = useFilteredPage<ParsedRow<unknown>, Filter>(
    rows,
    matches,
    'all',
    PAGE_SIZE
  )
  const indexed = useMemo<IndexedRow[]>(
    () => filtered.map(({ index, item }) => ({ index, row: item })),
    [filtered]
  )
  const summary = summarize(rows)
  const count = (value: number) => formatInteger(value, locale)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
          label={t('review.skipped')}
          value={count(summary.skipped)}
          onClick={() => {
            choose('skipped')
          }}
          pressed={filter === 'skipped'}
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
      {summary.skipped > 0 && (
        <Alert tone="info">{t('review.skippedNotice', { count: summary.skipped })}</Alert>
      )}
      <ReviewTable
        caption={name}
        columns={columns}
        rows={indexed}
        pagination={{ pageIndex: page, pageSize: PAGE_SIZE }}
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
