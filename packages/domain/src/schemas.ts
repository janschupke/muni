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
export const APP_ID_PREFIX = { session: 'S', completion: 'A' } as const

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
  status: z.enum(SESSION_STATUSES),
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

export const courseEditSchema = courseSchema.pick({ name: true, validityMonths: true }).extend({
  /** What one session needs: the planner's input. */
  /** At most 12 hours: from the usual 09:00 start, a session ends the same day. */
  sessionMinutes: z.int().min(15).max(720).nullable(),
  groupSize: z.int().min(1).max(10_000).nullable(),
  onlineAllowed: z.boolean(),
  capabilities,
})
export type CourseEdit = z.infer<typeof courseEditSchema>

const roomId = z.string().trim().min(1).max(64)

/**
 * Editing a session sets its anonymous seats; named bookings are assignment rows and are
 * managed separately, so the form never overwrites them.
 */
export const sessionEditSchema = z
  .object({ ...sessionTimes, roomId, unnamedBookings: z.int().min(0).max(10_000) })
  .refine(endAfterStart, endAfterStartIssue)
export type SessionEdit = z.infer<typeof sessionEditSchema>

/** A new session (from the planner or the course page); it starts with no bookings. */
export const sessionCreateSchema = z
  .object({
    courseCode: courseCodeSchema,
    ...sessionTimes,
    capacity: z.int().min(1).max(10_000),
    roomId,
  })
  .refine(endAfterStart, endAfterStartIssue)
export type SessionCreate = z.infer<typeof sessionCreateSchema>

/** The room form edits every field the import sets. */
export type RoomEdit = RoomInput

export const employeeEditSchema = z
  .object({
    firstName: trimmed(100),
    lastName: trimmed(100),
    email: z.email().max(254).nullable(),
    department: optionalText(120),
    position: optionalText(120),
    hiredOn: isoDate,
    leftOn: isoDate.nullable(),
    status: z.enum(EMPLOYMENT_STATUSES),
    note: optionalText(2000),
  })
  .refine(e => e.leftOn === null || e.leftOn >= e.hiredOn, {
    path: ['leftOn'],
    error: 'before_hired',
  })
export type EmployeeEdit = z.infer<typeof employeeEditSchema>

export const completionCreateSchema = z
  .object({
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
export type CompletionCreate = z.infer<typeof completionCreateSchema>
