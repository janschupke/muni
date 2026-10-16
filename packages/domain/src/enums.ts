// Domain enums. Values match the Prisma enums one-to-one so the db layer can pass them through.

export const EMPLOYMENT_STATUSES = ['ACTIVE', 'PARENTAL_LEAVE', 'TERMINATED'] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

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

/** Who is looking. There are no roles: signing in is the only distinction. */
export type Viewer = 'anonymous' | 'authenticated'
