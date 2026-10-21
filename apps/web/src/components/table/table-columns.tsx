'use client'

import type { DataColumns, RowData } from '@muni/ui/data-table'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import type { IsoDate } from '@muni/utils/dates'
import { formatCurrency, formatDate, PLACEHOLDER } from '@muni/utils/format'
import type { ReactNode } from 'react'

import { Link } from '@/components/navigation/link'
import { RowActions, type Target } from '@/components/views/record-actions'

// Columns every list has, built the same way in each: the record's name, linked and kept in
// view, dates, validity and amounts, and the row's trailing actions.

/** A column header with no visible title (the row's actions, booking), named for readers. */
export const hiddenHeader = (label: string) =>
  function HiddenHeader() {
    return <span className="sr-only">{label}</span>
  }

/**
 * The column naming each row: a link to its record, sorted by the name (the server's `name`
 * key). On a phone the table scrolls sideways; the name stays in view.
 */
export function nameColumn<T extends RowData>(
  col: DataColumns<T>,
  {
    header,
    name,
    href,
    meta,
  }: {
    header: string
    /** What the row is called; a dash when it has no name. */
    name: (row: T) => string | undefined
    href: (row: T) => string
    /** A line under the name (an ID). */
    meta?: ((row: T) => ReactNode) | undefined
  }
) {
  return col.accessor(row => name(row), {
    id: 'name',
    header,
    meta: { sticky: 'left' },
    sortFn: 'text',
    cell: ({ row }) => {
      const link = (
        <TextLink asChild emphasis>
          <Link href={href(row.original)}>{name(row.original) ?? PLACEHOLDER}</Link>
        </TextLink>
      )
      return meta ? <CellStack title={link} meta={meta(row.original)} /> : link
    },
  })
}

/** A row's trailing actions (edit, archive, remove): a narrow column, right-aligned. */
export function actionsColumn<T extends RowData>(
  col: DataColumns<T>,
  label: string,
  cell: (row: T) => ReactNode
) {
  return col.display({
    id: 'actions',
    header: hiddenHeader(label),
    meta: { headerClassName: 'w-0', align: 'right' },
    cell: ({ row }) => cell(row.original),
  })
}

/** A record's row actions (a pencil when it has a form, archive), for admins. */
export function rowActionsColumn<T extends RowData>(
  col: DataColumns<T>,
  label: string,
  target: (row: T) => Target
) {
  return actionsColumn(col, label, row => <RowActions {...target(row)} />)
}

/** A date-only value, as dd.mm.yyyy; ISO dates sort as the time does. */
export function dateColumn<T extends RowData>(
  col: DataColumns<T>,
  { id, header, value }: { id: string; header: string; value: (row: T) => IsoDate }
) {
  return col.accessor(row => value(row), {
    id,
    header,
    sortFn: 'basic',
    meta: { nowrap: true },
    cell: ({ getValue }) => formatDate(getValue()),
  })
}

/** Until when something is valid; `never` where it does not expire (those sort last). */
export function validUntilColumn<T extends RowData>(
  col: DataColumns<T>,
  { header, never, value }: { header: string; never: string; value: (row: T) => IsoDate | null }
) {
  return col.accessor(row => value(row) ?? undefined, {
    id: 'validUntil',
    header,
    sortFn: 'basic',
    meta: { nowrap: true },
    cell: ({ getValue }) => {
      const until = getValue()
      return until === undefined ? never : formatDate(until)
    },
  })
}

/** An amount in crowns, right-aligned; a dash where there is none (those sort last). */
export function priceColumn<T extends RowData>(
  col: DataColumns<T>,
  { header, value }: { header: string; value: (row: T) => number | null | undefined }
) {
  return col.accessor(row => value(row) ?? undefined, {
    id: 'price',
    header,
    sortFn: 'basic',
    meta: { align: 'right', nowrap: true },
    cell: ({ getValue }) => formatCurrency(getValue()),
  })
}
