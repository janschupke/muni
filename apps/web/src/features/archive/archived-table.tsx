'use client'

import type { ArchivedItem } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { createDataColumns, DataTable } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'

import { UserName } from '@/components/archived'
import { UnarchiveButton } from '@/components/unarchive-button'

import { ArchivedValue } from './archived-value'
import { archivedRecordPath } from './paths'

const col = createDataColumns<ArchivedItem>()

/**
 * A kind's archived records, most recently archived first. People are listed by tag only; an
 * admin opens one to see who it was. Each row can be brought back.
 */
export function ArchivedTable({ kind, items }: { kind: Archivable; items: ArchivedItem[] }) {
  const t = useTranslations('archive')
  const locale = useLocale()
  const columns = useMemo(() => {
    const nameOf = (item: ArchivedItem) =>
      item.label ?? t(kind === 'user' ? 'user' : 'person', { tag: item.tag })
    return col.columns([
      col.accessor(nameOf, {
        id: 'name',
        header: t('list.columns.name'),
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
        cell: ({ getValue }) => formatDateTime(getValue(), locale),
      }),
      col.display({
        id: 'archivedBy',
        header: t('list.columns.archivedBy'),
        cell: ({ row }) =>
          row.original.archivedBy ? <UserName user={row.original.archivedBy} /> : PLACEHOLDER,
      }),
      col.display({
        id: 'actions',
        header: () => <span className="sr-only">{t('list.columns.actions')}</span>,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <UnarchiveButton kind={kind} id={row.original.id} name={nameOf(row.original)} compact />
        ),
      }),
    ])
  }, [t, kind, locale])
  return (
    <DataTable
      caption={t(`kinds.${kind}.title`)}
      columns={columns}
      data={items}
      getRowId={i => i.id}
    />
  )
}
