// The columns each list sorts by on the server: its read accepts these (and nothing else) as
// `sort`, and they are its table's column ids. Shared by the reads, the pages that prefetch
// them and the views that ask for them, so all three agree.

export const COURSE_SORT = ['name', 'validity', 'compliance', 'completions', 'upcoming'] as const

export const GROUP_SORT = [
  'name',
  'head',
  'departments',
  'people',
  'compliance',
  'required',
  'actionNow',
  'bookings',
] as const

export const PROVIDER_SORT = [
  'name',
  'companyId',
  'completions',
  'people',
  'courses',
  'spend',
  'last',
] as const

export const ROOM_SORT = ['name', 'kind', 'capacity', 'upcoming', 'utilisation'] as const

export const USER_SORT = ['name', 'email', 'role', 'lastSignInAt'] as const

export const ARCHIVED_SORT = ['name', 'when', 'archivedAt'] as const

export const SESSION_SORT = ['course', 'date', 'room', 'capacity', 'price', 'status'] as const

/** A person's completions (their page). */
export const HISTORY_SORT = ['course', 'completedOn', 'validUntil', 'provider', 'price'] as const

/** Completions of a course or a provider. */
export const COMPLETION_SORT = ['employee', 'course', 'completedOn', 'validUntil', 'price'] as const

/** A provider's courses. */
export const PROVIDER_COURSE_SORT = ['course', 'completions', 'people', 'spend', 'last'] as const

/** The planner's offers, within each course. */
export const OFFER_SORT = ['due', 'slot', 'seats'] as const

/** Every advisor table's columns (each table sorts by its own). */
export const ADVISOR_SORT = [
  'rank',
  'person',
  'training',
  'lapses',
  'remediation',
  'proposal',
  'booked',
  'window',
] as const

/** The advisor's views (`?view=`). */
export const ADVISOR_VIEWS = ['breakdown', 'action', 'planned', 'overbooked'] as const

/** Rows per page in each of the advisor's tables. */
export const ADVISOR_PAGE_SIZE = 25
