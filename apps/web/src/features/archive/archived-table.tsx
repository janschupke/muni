'use client'

import type { ArchivedItem } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { createDataColumns, DataTable, type TablePaging } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { UserName } from '@/components/archived'
import { usePaginationLabels } from '@/components/pagination-labels'
import { UnarchiveButton } from '@/components/unarchive-button'

import { ArchivedValue } from './archived-value'
import { archivedRecordPath } from './paths'

const col = createDataColumns<ArchivedItem>()

/**
 * A kind's archived records, most recently archived first. People are listed by tag only; an
 * admin opens one to see who it was. Each row can be brought back.
 */
export function ArchivedTable({
  kind,
  items,
  paging,
}: {
  kind: Archivable
  items: ArchivedItem[]
  paging: TablePaging
}) {
  const t = useTranslations('archive')
  const paginationLabels = usePaginationLabels()
  const tc = useTranslations('common')
  const columns = useMemo(() => {
    const nameOf = (item: ArchivedItem) =>
      item.label ?? t(kind === 'user' ? 'user' : 'person', { tag: item.tag })
    return col.columns([
      col.accessor(nameOf, {
        id: 'name',
        header: t('list.columns.name'),
        // On a phone the table scrolls sideways; the name stays in view.
        meta: { sticky: 'left' },
        sortFn: 'text',
        cell: ({ row }) => (
          <CellStack
            title={
              <TextLink asChild emphasis>
                <Link href={archivedRecordPath(kind, row.original.id)}>{nameOf(row.original)}</Link>
              </TextLink>
            }
            meta={row.original.detail ?? undefined}
          />
        ),
      }),
      col.accessor(i => i.when?.value ?? undefined, {
        id: 'when',
        header: t('list.columns.when'),
        sortFn: 'basic',
        meta: { nowrap: true },
        cell: ({ row }) =>
          row.original.when ? <ArchivedValue field={row.original.when} /> : PLACEHOLDER,
      }),
      col.accessor('archivedAt', {
        header: t('list.columns.archivedAt'),
        sortFn: 'basic',
        meta: { nowrap: true },
        cell: ({ getValue }) => formatDateTime(getValue()),
      }),
      col.display({
        id: 'archivedBy',
        header: t('list.columns.archivedBy'),
        cell: ({ row }) =>
          row.original.archivedBy ? <UserName user={row.original.archivedBy} /> : PLACEHOLDER,
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">{tc('actions')}</span>,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <UnarchiveButton kind={kind} id={row.original.id} name={nameOf(row.original)} compact />
        ),
      }),
    ])
  }, [t, tc, kind])
  return (
    <DataTable
      caption={t(`kinds.${kind}.title`)}
      columns={columns}
      data={items}
      getRowId={i => i.id}
      paging={paging}
      paginationLabels={paginationLabels}
    />
  )
}
