import type { EmployeeSortKey } from '@muni/domain/enums'

import type { ADVISOR_SORT, ADVISOR_VIEWS, SESSION_SORT } from '@/lib/list/list-keys'
import type { ListInput } from '@/lib/list/search-params'
import type { ReadInput } from '@/server/reads/core/registry'

// The inputs of the reads whose input a page builds from its address. The page's prefetch
// and the view's query build them here, so both name the same cache entry.

export interface EmployeeListFilters {
  q?: string | undefined
  department?: string | undefined
  position?: string | undefined
  status?: ReadInput<'employees-list'>['status']
  compliance?: ReadInput<'employees-list'>['compliance']
  manager?: string | undefined
}

/** The employee list's filters with its sort and page (from the address, `parseList`). */
export const employeesListInput = (
  filters: EmployeeListFilters,
  list: ListInput<EmployeeSortKey>
): ReadInput<'employees-list'> => ({ ...filters, ...list })

/** What the sessions list shows: the window, and a room or course. */
export interface SessionListQuery {
  when: 'upcoming' | 'past'
  room?: string | undefined
  course?: string | undefined
}

/** The sessions list's filters with its sort and page (from the address, `parseList`). */
export const sessionsListInput = (
  { when, room, course }: SessionListQuery,
  list: ListInput<(typeof SESSION_SORT)[number]>
): ReadInput<'sessions-list'> => ({
  when: when === 'past' ? 'past' : undefined,
  room,
  course,
  ...list,
})

/**
 * The advisor's view and (breakdown only) its row, with the table's sort and page; the
 * breakdown and the `now` row are the advisor without them.
 */
export const advisorInput = (
  view: (typeof ADVISOR_VIEWS)[number],
  bucket: string | undefined,
  list: ListInput<(typeof ADVISOR_SORT)[number]>
): ReadInput<'advisor'> => ({
  ...(view !== 'breakdown' && { view }),
  ...(view === 'breakdown' && bucket !== undefined && bucket !== 'now' && { bucket }),
  ...list,
})
