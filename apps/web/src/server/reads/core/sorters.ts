import 'server-only'

import type {
  ArchivedItem,
  CourseListItem,
  DepartmentSummary,
  EmployeeDetail,
  PositionSummary,
  ProviderDetail,
  ProviderListItem,
  RoomListItem,
  SessionListItem,
  SortValue,
  UpcomingBooking,
  UserListItem,
} from '@muni/db/repositories'
import type { PlanItem } from '@muni/domain/advisor'
import type { PersonRef } from '@muni/domain/archive'
import { ROLES } from '@muni/domain/enums'
import type { SessionOffer } from '@muni/domain/planner'

import type {
  ADVISOR_SORT,
  ARCHIVED_SORT,
  BOOKING_SORT,
  COMPLETION_SORT,
  COURSE_SORT,
  GROUP_SORT,
  HISTORY_SORT,
  OFFER_SORT,
  PROVIDER_COURSE_SORT,
  PROVIDER_SORT,
  ROOM_SORT,
  SESSION_SORT,
  USER_SORT,
} from '@/lib/list/list-keys'

// How every list sorts on the server: one function per column, giving the value its table
// shows. Missing values (null, undefined, '') sort last either way (pageOf).

type Keys<K extends readonly string[], T> = Record<K[number], (row: T) => SortValue>

/** A person as a list names them: their name, or the tag that stands for it once archived. */
const personText = (person: PersonRef) => (person.archived ? `~${person.tag}` : person.name)

/** The course catalogue. */
export const courseKeys: Keys<typeof COURSE_SORT, CourseListItem> = {
  name: c => c.name,
  validity: c => c.validityMonths,
  compliance: c => (c.counts.total > 0 ? c.rate : null),
  completions: c => c.completionCount,
  upcoming: c => c.upcomingSessions,
}

/** The columns the departments' and positions' lists share. */
const groupKeys = {
  name: (g: DepartmentSummary | PositionSummary) => g.name,
  people: (g: DepartmentSummary | PositionSummary) => g.active,
  compliance: (g: DepartmentSummary | PositionSummary) => (g.counts.total > 0 ? g.rate : null),
  required: (g: DepartmentSummary | PositionSummary) => g.requiredCourses,
  actionNow: (g: DepartmentSummary | PositionSummary) => g.actionNow,
  bookings: (g: DepartmentSummary | PositionSummary) => g.upcomingBookings,
}

/** Departments: their head where positions have their departments. */
export const departmentKeys: Keys<typeof GROUP_SORT, DepartmentSummary> = {
  ...groupKeys,
  head: d => (d.head ? personText(d.head) : null),
  departments: () => null,
}

/** Positions: the departments they are in where departments have a head. */
export const positionKeys: Keys<typeof GROUP_SORT, PositionSummary> = {
  ...groupKeys,
  head: () => null,
  departments: p => p.departments.map(d => d.name).join(', '),
}

export const providerKeys: Keys<typeof PROVIDER_SORT, ProviderListItem> = {
  name: p => p.name,
  companyId: p => p.companyId,
  completions: p => p.completions,
  people: p => p.people,
  courses: p => p.courses,
  spend: p => p.spend,
  last: p => p.lastCompletedOn,
}

export const roomKeys: Keys<typeof ROOM_SORT, RoomListItem> = {
  name: r => r.name,
  kind: r => r.kind,
  capacity: r => r.capacity,
  upcoming: r => r.upcomingSessions,
  utilisation: r => r.utilisation,
}

export const userKeys: Keys<typeof USER_SORT, UserListItem> = {
  name: u => u.name,
  email: u => u.email,
  // Highest role first when ascending, as the list shows them without a sort.
  role: u => ROLES.length - ROLES.indexOf(u.role),
  lastSignInAt: u => u.lastSignInAt,
}

/** Archived records: people by the tag that stands for them, the one name the list shows. */
export const archivedKeys: Keys<typeof ARCHIVED_SORT, ArchivedItem> = {
  name: i => i.label ?? `~${i.tag}`,
  when: i => i.when?.value,
  archivedAt: i => i.archivedAt,
}

/** The advisor's tables, one function per column of any of them. */
export const advisorKeys: Keys<typeof ADVISOR_SORT, PlanItem> = {
  rank: i => i.proposal?.rank,
  person: i => i.need.employee.name,
  training: i => i.need.course.name,
  lapses: i => i.lapses,
  remediation: i => i.remediation,
  proposal: i => (i.proposal?.kind === 'SESSION' ? Date.parse(i.proposal.session.startsAt) : null),
  booked: i => (i.booked ? Date.parse(i.booked.startsAt) : null),
  window: i => i.window?.days,
}

/** The planner's offers, within their course. */
export const offerKeys: Keys<typeof OFFER_SORT, SessionOffer> = {
  due: o => o.deadline,
  slot: o => o.slot?.startsAt,
  seats: o => o.size,
}

/** Sessions, wherever they are listed (the list, a room's, a course's). */
export const sessionKeys: Record<(typeof SESSION_SORT)[number], (s: SessionListItem) => SortValue> =
  {
    course: s => s.courseName,
    date: s => Date.parse(s.startsAt),
    room: s => s.room.name,
    provider: s => s.provider.name,
    // How full: booked seats over capacity.
    capacity: s => (s.capacity > 0 ? s.bookedCount / s.capacity : null),
    price: s => s.pricePerPerson,
    status: s => s.status,
  }

/** Completions of a course or a provider (the columns a course's list lacks sort as empty). */
export const completionKeys: Record<
  (typeof COMPLETION_SORT)[number],
  (c: {
    employee: PersonRef
    completedOn: string
    validUntil: string | null
    courseName?: string | undefined
    price?: number | null | undefined
  }) => SortValue
> = {
  employee: c => personText(c.employee),
  course: c => c.courseName,
  completedOn: c => c.completedOn,
  validUntil: c => c.validUntil,
  price: c => c.price,
}

/** A person's completions, on their page. */
export const historyKeys: Keys<typeof HISTORY_SORT, EmployeeDetail['completions'][number]> = {
  course: c => c.courseName,
  completedOn: c => c.completedOn,
  validUntil: c => c.validUntil,
  provider: c => c.provider?.name,
  price: c => c.price,
}

/** A provider's courses, with what was completed of each. */
export const providerCourseKeys: Keys<
  typeof PROVIDER_COURSE_SORT,
  ProviderDetail['byCourse'][number]
> = {
  course: c => c.name,
  completions: c => c.completions,
  people: c => c.people,
  spend: c => c.spend,
  last: c => c.lastCompletedOn,
}

/** Upcoming bookings of a department's or a position's people. */
export const bookingKeys: Keys<typeof BOOKING_SORT, UpcomingBooking> = {
  person: b => b.person.name,
  course: b => b.courseName,
  date: b => b.startsAt,
  room: b => b.room.name,
}
