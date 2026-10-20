import { todayIn } from '@muni/utils/dates'
import * as z from 'zod'

import { SESSION_STATUSES } from '../enums'
import { courseCodeSchema, externalIdSchema, isoDate, money, time, trimmed } from './fields'

const sessionTimes = {
  date: isoDate,
  startTime: time,
  endTime: time,
  capacity: z.int().min(0).max(10_000),
  pricePerPerson: money,
}

/**
 * A session as the app schedules it: its course and provider, when it starts (it ends its
 * course's length later), its room and its own seats. Its price is the provider's for the
 * course, never typed in.
 */
const appSession = {
  courseId: z.string().trim().min(1).max(64),
  providerId: z.string().trim().min(1).max(64),
  date: isoDate,
  startTime: time,
  roomId: z.string().trim().min(1).max(64),
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
  /** Who holds it, by name; none = the default provider. */
  providerName: trimmed(200).nullable(),
  bookedCount: z.int().min(0).max(10_000),
})
const endAfterStart = (s: { startTime: string; endTime: string }) => s.endTime > s.startTime
const endAfterStartIssue = { path: ['endTime'], error: 'before_start' }

export const sessionSchema = sessionBase.refine(endAfterStart, endAfterStartIssue)
export type SessionInput = z.infer<typeof sessionSchema>

/**
 * Editing a session sets its course, room, times and anonymous seats; named bookings are
 * assignment rows and are managed separately, so the form never overwrites them, and so is its
 * status (cancelling and reinstating are their own acts). The server also checks the seats
 * against the named bookings.
 */
export const sessionEditSchema = z
  .object({
    ...appSession,
    capacity: z.int().min(0).max(10_000),
    unnamedBookings: z.int().min(0).max(10_000),
  })
  .refine(s => s.unnamedBookings <= s.capacity, { path: ['capacity'], error: 'over_capacity' })
export type SessionEdit = z.infer<typeof sessionEditSchema>

/** A new session (from the planner or the course page); it starts with no bookings. */
export const sessionCreateSchema = z
  .object({ ...appSession, capacity: z.int().min(1).max(10_000) })
  // A new session is planned, so ahead: one on an earlier day is a typo (record a completion for
  // what already took place). Checked against today wherever it is parsed, form or server.
  .refine(s => s.date >= todayIn(), {
    path: ['date'],
    error: 'in_past',
  })
export type SessionCreate = z.infer<typeof sessionCreateSchema>

/** One named booking, added by hand. */
export const bookingSchema = z.object({
  sessionExternalId: externalIdSchema,
  employeeExternalId: externalIdSchema,
})
