import { todayIn } from '@muni/utils/dates'
import { isCompanyId } from '@muni/utils/text'
import * as z from 'zod'

import {
  CAPABILITIES,
  EMPLOYMENT_STATUSES,
  REQUIREMENT_SCOPES,
  ROOM_KINDS,
  SESSION_STATUSES,
} from './enums'

// Normalised records. The importer produces them; the server re-validates them on commit;
// the edit forms use the same shapes. Validation failures surface as zod issue codes,
// which the web app translates (forms.errors.<code>).

const isoDate = z.iso.date()
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
const trimmed = (max: number) => z.string().trim().min(1).max(max)
const optionalText = (max: number) => z.string().trim().max(max).nullable()
const money = z.number().min(0).max(1_000_000).nullable()

export const courseCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/)
  .max(32)

export const externalIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]\d{3,8}$/)

/**
 * ID prefixes for records created in the app. Imports refuse them, so a source export can
 * never overwrite something entered here.
 */
export const APP_ID_PREFIX = { session: 'S', completion: 'A', employee: 'N' } as const

export const requirementSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('ALL') }),
  z.object({ scope: z.literal('DEPARTMENT'), department: trimmed(120) }),
  z.object({ scope: z.literal('POSITION'), position: trimmed(120) }),
])
export type RequirementInput = z.infer<typeof requirementSchema>
export const requirementScopeSchema = z.enum(REQUIREMENT_SCOPES)

export const courseSchema = z.object({
  code: courseCodeSchema,
  name: trimmed(200),
  /** null = never expires (one-off course or optional course). */
  validityMonths: z.int().min(1).max(240).nullable(),
  requirements: z.array(requirementSchema).max(50),
})
export type CourseInput = z.infer<typeof courseSchema>

const capabilities = z
  .array(z.enum(CAPABILITIES))
  .refine(list => new Set(list).size === list.length, { error: 'duplicate' })

export const roomSchema = z
  .object({
    name: trimmed(200),
    kind: z.enum(ROOM_KINDS),
    /** Seats; null = no fixed limit, which only an online room may have. */
    capacity: z.int().min(1).max(10_000).nullable(),
    /** null = leave the equipment as it is (a rooms file without that column); none for a new room. */
    capabilities: capabilities.nullable(),
    note: optionalText(2000),
  })
  .refine(r => r.kind === 'ONLINE' || r.capacity !== null, {
    path: ['capacity'],
    error: 'required',
  })
  // An online room has no seat limit: whatever was entered is dropped.
  .transform(r => (r.kind === 'ONLINE' ? { ...r, capacity: null } : r))
export type RoomInput = z.infer<typeof roomSchema>

/** Who delivers training; only the name is required. */
export const providerSchema = z.object({
  name: trimmed(200),
  /** IČO, written with or without spaces. */
  companyId: z
    .string()
    .transform(v => v.replace(/\s/g, ''))
    .refine(isCompanyId, { error: 'company_id' })
    .nullable(),
  email: z.email().max(254).nullable(),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()/-]{6,30}$/)
    .nullable(),
  /** A bare domain (`www.example.cz`) is read as https. */
  website: z
    .string()
    .trim()
    .transform(v => (/^[a-z][a-z\d+.-]*:/i.test(v) ? v : `https://${v}`))
    .pipe(z.url({ protocol: /^https?$/ }).max(500))
    .nullable(),
  note: optionalText(2000),
})
export type ProviderInput = z.infer<typeof providerSchema>

export const employeeSchema = z
  .object({
    externalId: externalIdSchema,
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: z.email().max(254).nullable(),
    nationalId: z
      .string()
      .regex(/^\d{6}\/?\d{3,4}$/)
      .nullable(),
    department: optionalText(120),
    position: optionalText(120),
    managerEmail: z.email().max(254).nullable(),
    hiredOn: isoDate,
    leftOn: isoDate.nullable(),
    status: z.enum(EMPLOYMENT_STATUSES),
    note: optionalText(2000),
  })
  .refine(e => e.leftOn === null || e.leftOn >= e.hiredOn, {
    path: ['leftOn'],
    error: 'before_hired',
  })
export type EmployeeInput = z.infer<typeof employeeSchema>

const sessionTimes = {
  date: isoDate,
  startTime: time,
  endTime: time,
  capacity: z.int().min(0).max(10_000),
  pricePerPerson: money,
}

/**
 * An imported session names its room (`location`, the export's "místo"); the writer
 * resolves it to a room, creating one when there is no such room yet (its kind then follows
 * from the name).
 */
const sessionBase = z.object({
  externalId: externalIdSchema,
  courseCode: courseCodeSchema,
  ...sessionTimes,
  /** The source's state; in the app a session changes it only by being cancelled or reinstated. */
  status: z.enum(SESSION_STATUSES),
  location: trimmed(200),
  bookedCount: z.int().min(0).max(10_000),
})
const endAfterStart = (s: { startTime: string; endTime: string }) => s.endTime > s.startTime
const endAfterStartIssue = { path: ['endTime'], error: 'before_start' }

export const sessionSchema = sessionBase.refine(endAfterStart, endAfterStartIssue)
export type SessionInput = z.infer<typeof sessionSchema>

export const completionSchema = z
  .object({
    externalId: externalIdSchema,
    employeeExternalId: externalIdSchema,
    courseCode: courseCodeSchema,
    completedOn: isoDate,
    validUntil: isoDate.nullable(),
    provider: optionalText(200),
    price: money,
    note: optionalText(2000),
  })
  .refine(c => c.validUntil === null || c.validUntil >= c.completedOn, {
    path: ['validUntil'],
    error: 'before_completed',
  })
export type CompletionInput = z.infer<typeof completionSchema>

// ---- Edit forms -------------------------------------------------------------------------

/** A record's internal id, as a form posts it (a select's value). */
const entityId = z.string().trim().min(1).max(64)
const entityIds = z
  .array(entityId)
  .max(500)
  .refine(ids => new Set(ids).size === ids.length, { error: 'duplicate' })

export const courseEditSchema = courseSchema.pick({ name: true, validityMonths: true }).extend({
  /** Who must hold it: everyone, and/or these departments and positions; none = optional. */
  requiredForAll: z.boolean(),
  departmentIds: entityIds,
  positionIds: entityIds,
  /**
   * What one session needs, where the app overrides what the sessions import derives:
   * null = take the derived value. At most 12 hours: from the usual 09:00 start, a session
   * ends the same day.
   */
  sessionMinutes: z.int().min(15).max(720).nullable(),
  groupSize: z.int().min(1).max(10_000).nullable(),
  onlineAllowed: z.boolean().nullable(),
  capabilities,
})
export type CourseEdit = z.infer<typeof courseEditSchema>

export const courseCreateSchema = courseEditSchema.extend({ code: courseCodeSchema })
export type CourseCreate = z.infer<typeof courseCreateSchema>

/**
 * Editing a session sets its course, room, times and anonymous seats; named bookings are
 * assignment rows and are managed separately, so the form never overwrites them, and so is its
 * status (cancelling and reinstating are their own acts). The server also checks the seats
 * against the named bookings.
 */
export const sessionEditSchema = z
  .object({
    courseId: entityId,
    ...sessionTimes,
    roomId: entityId,
    unnamedBookings: z.int().min(0).max(10_000),
  })
  .refine(endAfterStart, endAfterStartIssue)
  .refine(s => s.unnamedBookings <= s.capacity, { path: ['capacity'], error: 'over_capacity' })
export type SessionEdit = z.infer<typeof sessionEditSchema>

/** A new session (from the planner or the course page); it starts with no bookings. */
export const sessionCreateSchema = z
  .object({
    courseId: entityId,
    ...sessionTimes,
    capacity: z.int().min(1).max(10_000),
    roomId: entityId,
  })
  .refine(endAfterStart, endAfterStartIssue)
  // A new session is planned, so ahead: one on an earlier day is a typo (record a completion for
  // what already took place). Checked against today wherever it is parsed, form or server.
  .refine(s => s.date >= todayIn(), {
    path: ['date'],
    error: 'in_past',
  })
export type SessionCreate = z.infer<typeof sessionCreateSchema>

/** The room form edits every field the import sets. */
export type RoomEdit = RoomInput

/** What the app edits of a person; a new person gets an `N`-prefixed ID. */
export const employeeEditSchema = z
  .object({
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: z.email().max(254).nullable(),
    nationalId: z
      .string()
      .regex(/^\d{6}\/?\d{3,4}$/)
      .nullable(),
    departmentId: entityId.nullable(),
    /** One of the positions the department has. */
    positionId: entityId.nullable(),
    /** Someone else, and not anyone the person manages (directly or further down). */
    managerId: entityId.nullable(),
    /** Leads their department (which then needs to be set). */
    leadsDepartment: z.boolean(),
    hiredOn: isoDate,
    leftOn: isoDate.nullable(),
    status: z.enum(EMPLOYMENT_STATUSES),
    note: optionalText(2000),
  })
  .refine(e => e.leftOn === null || e.leftOn >= e.hiredOn, {
    path: ['leftOn'],
    error: 'before_hired',
  })
  .refine(e => !e.leadsDepartment || e.departmentId !== null, {
    path: ['leadsDepartment'],
    error: 'no_department',
  })
export type EmployeeEdit = z.infer<typeof employeeEditSchema>

/**
 * A completion as the form records or corrects it. The provider is picked (`providerId`) or
 * named as a new one (`newProviderName`), never both: a name is never matched to a provider
 * silently. An empty validity is worked out from the course.
 */
export const completionEditSchema = z
  .object({
    employeeId: entityId,
    courseId: entityId,
    completedOn: isoDate,
    validUntil: isoDate.nullable(),
    providerId: entityId.nullable(),
    newProviderName: optionalText(200),
    price: money,
    note: optionalText(2000),
  })
  .refine(c => c.validUntil === null || c.validUntil >= c.completedOn, {
    path: ['validUntil'],
    error: 'before_completed',
  })
  .refine(c => c.providerId === null || c.newProviderName === null, {
    path: ['newProviderName'],
    error: 'provider_both',
  })
export type CompletionEdit = z.infer<typeof completionEditSchema>

/** A department: its name and who leads it (one of its members). */
export const departmentSchema = z.object({ name: trimmed(120), headId: entityId.nullable() })
export type DepartmentInput = z.infer<typeof departmentSchema>

/** A position: its name and the departments it exists in. */
export const positionSchema = z.object({ name: trimmed(120), departmentIds: entityIds })
export type PositionInput = z.infer<typeof positionSchema>

/** One named booking, added by hand. */
export const bookingSchema = z.object({
  sessionExternalId: externalIdSchema,
  employeeExternalId: externalIdSchema,
})
