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

export const sessionsListInput = (
  when: 'upcoming' | 'past',
  room: string | undefined
): ReadInput<'sessions-list'> => ({ when: when === 'past' ? 'past' : undefined, room })
