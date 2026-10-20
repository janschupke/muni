import 'server-only'

import {
  getDepartment,
  getDepartmentForEdit,
  getGroupName,
  getPosition,
  getPositionForEdit,
  listDepartmentSummaries,
  listGroupMembers,
  listGroupOptions,
  listPositionSummaries,
  listUpcomingBookings,
  pageEmployees,
  pageOf,
} from '@muni/db/repositories'
import { EMPLOYEE_SORT_KEYS } from '@muni/domain/enums'
import * as z from 'zod'

import { BOOKING_SORT, GROUP_SORT } from '@/lib/list/list-keys'
import { listQuery } from '@/lib/list/search-params'

import { byId, listInput, read } from './core/define'
import { bookingKeys, departmentKeys, positionKeys } from './core/sorters'

/** Departments, a page at a time, with how many people each has and how they comply. */
export const departmentsList = read({
  guard: 'reader',
  input: z.object(listInput(GROUP_SORT)),
  load: async input =>
    pageOf(await listDepartmentSummaries(), listQuery(input, GROUP_SORT), departmentKeys),
})

/** Positions, a page at a time, with how many people hold each and how they comply. */
export const positionsList = read({
  guard: 'reader',
  input: z.object(listInput(GROUP_SORT)),
  load: async input =>
    pageOf(await listPositionSummaries(), listQuery(input, GROUP_SORT), positionKeys),
})

/**
 * A department's or position's people with their records, when its row in the list opens: a
 * page at a time, the most urgent first (the order is the list's own; it has no sort).
 */
export const groupMembers = read({
  guard: 'reader',
  input: byId.extend({
    kind: z.enum(['department', 'position']),
    page: z.coerce.number().int().min(1).optional(),
  }),
  load: async ({ kind, id, page }) => {
    const members = await listGroupMembers(kind, id)
    return members && pageOf(members, { page: page ?? 1, pageSize: MEMBERS_PAGE }, {})
  },
})

/**
 * A department's or position's upcoming bookings (the ones its list counts): its people's
 * named bookings on sessions still ahead, a page at a time, soonest first unless sorted.
 */
export const groupBookings = read({
  guard: 'reader',
  input: byId.extend({
    kind: z.enum(['department', 'position']),
    ...listInput(BOOKING_SORT),
  }),
  load: async ({ kind, id, ...list }) => {
    const [name, bookings] = await Promise.all([
      getGroupName(kind, id),
      listUpcomingBookings(kind === 'department' ? { department: id } : { position: id }),
    ])
    return name === null
      ? null
      : { name, bookings: pageOf(bookings, listQuery(list, BOOKING_SORT), bookingKeys) }
  },
})

/** People an opened row shows at a time. */
const MEMBERS_PAGE = 10

/** A department's or position's page with a page of its people (`peopleSort`…). */
const groupPage = byId.extend(listInput(EMPLOYEE_SORT_KEYS, 'people'))

/**
 * A department's page: its head, positions, courses, and a page of its people sorted on the
 * server (most urgent first without a sort).
 */
export const department = read({
  guard: 'reader',
  input: groupPage,
  load: async ({ id, ...list }) => {
    const found = await getDepartment(id)
    return (
      found && {
        ...found,
        members: pageEmployees(found.members, listQuery(list, EMPLOYEE_SORT_KEYS, 'people')),
      }
    )
  },
})

/** A position's page: its departments, courses, and a page of its people. */
export const position = read({
  guard: 'reader',
  input: groupPage,
  load: async ({ id, ...list }) => {
    const found = await getPosition(id)
    return (
      found && {
        ...found,
        members: pageEmployees(found.members, listQuery(list, EMPLOYEE_SORT_KEYS, 'people')),
      }
    )
  },
})

/** The department form: its name, and the members who can lead it. */
export const departmentForm = read({
  guard: 'admin',
  input: byId,
  load: ({ id }) => getDepartmentForEdit(id),
})

/** The position form: the position (none for a new one) and the departments it can be in. */
export const positionForm = read({
  guard: 'admin',
  input: byId.partial(),
  load: async ({ id }) => {
    const [edited, departments] = await Promise.all([
      id ? getPositionForEdit(id) : null,
      listGroupOptions('department'),
    ])
    if (id && !edited) return null
    return { position: edited, departments }
  },
})
