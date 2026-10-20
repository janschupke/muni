import type { RowSelection } from './types'

/**
 * The page's checkboxes: which rows on it can be picked, the header box's state (none, all,
 * some), and what checking it or a row's box does to the selection.
 */
export function pageSelection<TData>(
  selection: RowSelection<TData> | undefined,
  rows: readonly { id: string; original: TData }[]
) {
  const selectableIds = selection
    ? rows.filter(row => selection.isRowSelectable?.(row.original) ?? true).map(row => row.id)
    : []
  const picked = selectableIds.filter(id => selection?.selected.has(id)).length
  const pageState: boolean | 'indeterminate' =
    picked === 0 ? false : picked === selectableIds.length ? true : 'indeterminate'
  const togglePage = () => {
    if (!selection) return
    const next = new Set(selection.selected)
    for (const id of selectableIds) {
      if (pageState === true) next.delete(id)
      else next.add(id)
    }
    selection.onSelectedChange(next)
  }
  const toggleRow = (id: string, on: boolean) => {
    if (!selection) return
    const next = new Set(selection.selected)
    if (on) next.add(id)
    else next.delete(id)
    selection.onSelectedChange(next)
  }
  return { selectableIds, pageState, togglePage, toggleRow }
}
