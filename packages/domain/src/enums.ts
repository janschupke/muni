// Domain enums. Values match the Prisma enums one-to-one so the db layer can pass them through.

/** What a person's record says: at work or on leave. Leaving is a date, not a status. */
export const EMPLOYMENT_STATUSES = ['ACTIVE', 'PARENTAL_LEAVE'] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

/** Where a person stands on a given day: their status, or LEFT once their leaving date is reached. */
export const EMPLOYMENT_STATES = [...EMPLOYMENT_STATUSES, 'LEFT'] as const
export type EmploymentState = (typeof EMPLOYMENT_STATES)[number]

/** LEFT from the leaving date on (`leftOn <= today`); before it, the status. ISO dates. */
export function employmentState(
  status: EmploymentStatus,
  leftOn: string | null,
  today: string
): EmploymentState {
  return leftOn !== null && leftOn <= today ? 'LEFT' : status
}

export const REQUIREMENT_SCOPES = ['ALL', 'DEPARTMENT', 'POSITION'] as const
export type RequirementScope = (typeof REQUIREMENT_SCOPES)[number]

export const SESSION_STATUSES = ['PLANNED', 'CANCELLED'] as const
export type SessionStatus = (typeof SESSION_STATUSES)[number]

export const ROOM_KINDS = ['CLASSROOM', 'LAB', 'ONLINE', 'EXTERNAL', 'OUTDOOR'] as const
export type RoomKind = (typeof ROOM_KINDS)[number]

/** What a room offers, and what a course needs from one. */
export const CAPABILITIES = [
  'PROJECTOR',
  'COMPUTERS',
  'LAB_EQUIPMENT',
  'VEHICLE',
  'PRACTICAL_AREA',
  'VIDEO_CONFERENCE',
  'WHEELCHAIR_ACCESS',
] as const
export type Capability = (typeof CAPABILITIES)[number]

export const COMPLIANCE_STATUSES = ['VALID', 'EXPIRING', 'EXPIRED', 'MISSING'] as const
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number]

/**
 * What a signed-in user may do, assigned in Clerk (`publicMetadata.role`, lowercase there).
 * VIEWER reads with personal data redacted, FULL reads everything, ADMIN also writes.
 * Visitors who are not signed in see no data at all, so they have no role.
 */
export const ROLES = ['VIEWER', 'FULL', 'ADMIN'] as const
export type Role = (typeof ROLES)[number]

/** A role from Clerk metadata (`viewer`, `Full`, …), or null when missing or unknown. */
export function parseRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null
  const upper = value.trim().toUpperCase()
  return ROLES.find(role => role === upper) ?? null
}

/** How a role is written in Clerk metadata. */
export function roleMetadata(role: Role): string {
  return role.toLowerCase()
}

/** Only admins edit, book seats and import. */
export function canWrite(role: Role): boolean {
  return role === 'ADMIN'
}

/** The columns the employee list (and a department's or position's people) sort by. */
export const EMPLOYEE_SORT_KEYS = [
  'name',
  'department',
  'position',
  'status',
  'compliance',
  'required',
] as const
export type EmployeeSortKey = (typeof EMPLOYEE_SORT_KEYS)[number]
