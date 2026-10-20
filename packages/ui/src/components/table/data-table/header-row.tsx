import { FlexRender, type HeaderGroup, type RowData } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

import { cn } from '../../../cn'
import { SelectBox } from '../../forms/checkbox'
import { Th } from '../table'
import type { Features } from './columns'

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

function SortIcon({ direction }: { direction: false | 'asc' | 'desc' }) {
  const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ChevronsUpDown
  return (
    <Icon
      aria-hidden
      className={cn('size-3.5 shrink-0', direction === false && 'text-fg-subtle')}
    />
  )
}

/**
 * The column headers: the disclosure column's hidden name, the page's checkbox, then each
 * column, a sortable one as a button that names its order (`aria-sort`).
 */
export function HeaderRow<TData extends RowData>({
  group,
  expandHeader,
  selectPage,
}: {
  group: HeaderGroup<Features, TData>
  /** The disclosure column's hidden name; none without one. */
  expandHeader: string | null
  /** The page's checkbox; none without selection, an empty cell with nothing to pick. */
  selectPage: {
    shown: boolean
    checked: boolean | 'indeterminate'
    onToggle: () => void
    label: string
  } | null
}) {
  return (
    <tr>
      {expandHeader !== null && (
        <Th className="w-0 px-1">
          <span className="sr-only">{expandHeader}</span>
        </Th>
      )}
      {selectPage && (
        <Th className="w-0 px-2">
          {selectPage.shown && (
            <SelectBox
              checked={selectPage.checked}
              onCheckedChange={selectPage.onToggle}
              aria-label={selectPage.label}
            />
          )}
        </Th>
      )}
      {group.headers.map(header => {
        const meta = header.column.columnDef.meta
        const sorted = header.column.getIsSorted()
        const content = header.isPlaceholder ? null : <FlexRender header={header} />
        return (
          <Th
            key={header.id}
            align={meta?.align}
            sticky={meta?.sticky}
            aria-sort={sorted ? ARIA_SORT[sorted] : undefined}
            className={meta?.headerClassName}
          >
            {header.column.getCanSort() ? (
              <button
                type="button"
                onClick={header.column.getToggleSortingHandler()}
                className={cn(
                  '-mx-1 inline-flex min-h-6 items-center gap-1 rounded-sm px-1 transition-colors hover:bg-state-hover hover:text-fg',
                  sorted && 'text-fg'
                )}
              >
                {content}
                <SortIcon direction={sorted} />
              </button>
            ) : (
              content
            )}
          </Th>
        )
      })}
    </tr>
  )
}
