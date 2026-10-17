import type { ReadInput } from '@/server/reads/registry'

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

export interface EmployeeListSort {
  by: NonNullable<ReadInput<'employees-list'>['sort']>
  desc: boolean
}

/** Everything that shapes the employee list, without the page. */
export const employeesQuery = (
  filters: EmployeeListFilters,
  sort: EmployeeListSort | undefined
) => ({
  ...filters,
  sort: sort?.by,
  dir: sort?.desc ? ('desc' as const) : undefined,
})

export const employeesListInput = (
  filters: EmployeeListFilters,
  sort: EmployeeListSort | undefined,
  page: number
): ReadInput<'employees-list'> => ({ ...employeesQuery(filters, sort), page })

/** What the sessions list shows: the window, a room or course, and (past only) the page. */
export interface SessionListQuery {
  when: 'upcoming' | 'past'
  room?: string | undefined
  course?: string | undefined
  page?: number | undefined
}

export const sessionsListInput = ({
  when,
  room,
  course,
  page,
}: SessionListQuery): ReadInput<'sessions-list'> => ({
  when: when === 'past' ? 'past' : undefined,
  room,
  course,
  // The first page is the list without a page.
  page: when === 'past' && page !== undefined && page > 1 ? page : undefined,
})
