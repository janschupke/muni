import { forecastEnd } from '@muni/domain/advisor'
import { appliesTo, bestCompletion } from '@muni/domain/compliance'
import type { RoomRef } from '@muni/domain/rooms'
import { isoDateFromUtc, type IsoDate } from '@muni/utils/dates'

import type { Prisma } from '../generated/prisma/client'
import { audienceSelect, rulesOf } from './audience'
import { complianceOptions, dbOf, type RepoOptions } from './context'
import { roomRefSelect } from './sessions'

type Tx = Prisma.TransactionClient

export const ASSIGNMENT_FAILURES = [
  'SESSION_NOT_FOUND',
  'EMPLOYEE_NOT_FOUND',
  'INACTIVE',
  'NOT_PLANNED',
  'PAST',
  'SESSION_FULL',
  'ALREADY_ASSIGNED',
  'CONFLICT',
  'NOT_REQUIRED',
  'NOT_NEEDED',
] as const
export type AssignmentFailure = (typeof ASSIGNMENT_FAILURES)[number]

export interface AssignmentRequest {
  sessionExternalId: string
  employeeExternalId: string
  /** ADVISOR requests are re-checked: required, and lapsed or lapsing within the forecast. */
  source: 'ADVISOR' | 'MANUAL'
}

export type AssignmentOutcome =
  | { request: AssignmentRequest; ok: true }
  | { request: AssignmentRequest; ok: false; reason: AssignmentFailure }

interface LockedSession {
  id: string
  course_id: string
  capacity: number
  unnamed_bookings: number
  status: 'PLANNED' | 'CANCELLED'
  starts_at: Date
  ends_at: Date
}

/** Locks the session row for the rest of the transaction; concurrent writers queue behind it. */
async function lockSessions(tx: Tx, externalIds: string[]): Promise<Map<string, LockedSession>> {
  // Id order is the lock order everywhere, so two movers in opposite directions cannot deadlock.
  const rows = await tx.$queryRaw<(LockedSession & { external_id: string })[]>`
    SELECT id, external_id, course_id, capacity, unnamed_bookings, status::text AS status,
           starts_at, ends_at
    FROM course_sessions
    WHERE external_id = ANY(${externalIds})
    ORDER BY id
    FOR UPDATE`
  return new Map(rows.map(r => [r.external_id, r]))
}

const bookedIn = async (tx: Tx, session: LockedSession) =>
  session.unnamed_bookings +
  (await tx.sessionAssignment.count({ where: { sessionId: session.id } }))

/**
 * Applies each request in its own transaction, so one refusal never undoes the others.
 * Every rule is checked here, against the locked row; the client's plan is never trusted.
 */
export async function applyAssignments(
  requests: AssignmentRequest[],
  userId: string,
  options?: RepoOptions & { now?: Date }
): Promise<AssignmentOutcome[]> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const outcomes: AssignmentOutcome[] = []
  for (const request of requests) {
    const reason = await db.$transaction(tx => applyOne(tx, request, userId, now, options?.asOf))
    outcomes.push(reason === null ? { request, ok: true } : { request, ok: false, reason })
  }
  return outcomes
}

async function applyOne(
  tx: Tx,
  request: AssignmentRequest,
  userId: string,
  now: Date,
  asOf: IsoDate | undefined
): Promise<AssignmentFailure | null> {
  const session = (await lockSessions(tx, [request.sessionExternalId])).get(
    request.sessionExternalId
  )
  if (!session) return 'SESSION_NOT_FOUND'
  const employee = await tx.employee.findUnique({
    where: { externalId: request.employeeExternalId },
    select: { id: true, status: true, departmentId: true, positionId: true },
  })
  if (!employee) return 'EMPLOYEE_NOT_FOUND'
  if (employee.status === 'TERMINATED') return 'INACTIVE'
  if (session.status !== 'PLANNED') return 'NOT_PLANNED'
  if (session.starts_at <= now) return 'PAST'
  // The person's row too (always after the session's): two concurrent applies for one person
  // into overlapping sessions would otherwise both pass the clash check.
  await tx.$queryRaw`SELECT id FROM employees WHERE id = ${employee.id} FOR UPDATE`

  const existing = await tx.sessionAssignment.findUnique({
    where: { sessionId_employeeId: { sessionId: session.id, employeeId: employee.id } },
    select: { id: true },
  })
  if (existing) return 'ALREADY_ASSIGNED'
  if ((await bookedIn(tx, session)) >= session.capacity) return 'SESSION_FULL'

  const clash = await tx.sessionAssignment.findFirst({
    where: {
      employeeId: employee.id,
      session: {
        status: 'PLANNED',
        startsAt: { lt: session.ends_at },
        endsAt: { gt: session.starts_at },
      },
    },
    select: { id: true },
  })
  if (clash) return 'CONFLICT'

  if (request.source === 'ADVISOR') {
    const course = await tx.course.findUniqueOrThrow({
      where: { id: session.course_id },
      select: { id: true, ...audienceSelect },
    })
    if (!rulesOf(course).some(r => appliesTo(r, employee))) return 'NOT_REQUIRED'
    const completions = await tx.courseCompletion.findMany({
      where: { employeeId: employee.id, courseId: session.course_id },
      select: { employeeId: true, courseId: true, completedOn: true, validUntil: true },
    })
    const opts = complianceOptions(asOf)
    const best = bestCompletion(
      completions.map(c => ({
        ...c,
        completedOn: isoDateFromUtc(c.completedOn),
        validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
      })),
      opts.asOf
    )
    // Valid beyond the advisor's forecast (or for good): nothing to remedy yet.
    if (best !== null && (best.validUntil === null || best.validUntil >= forecastEnd(opts.asOf)))
      return 'NOT_NEEDED'
  }

  await tx.sessionAssignment.create({
    data: {
      sessionId: session.id,
      employeeId: employee.id,
      source: request.source,
      createdBy: userId,
    },
  })
  return null
}

/** Removes a named booking; the session's booked total follows (it is derived). */
export async function removeAssignment(
  sessionExternalId: string,
  employeeExternalId: string,
  options?: RepoOptions
): Promise<boolean> {
  const { count } = await dbOf(options).sessionAssignment.deleteMany({
    where: {
      session: { externalId: sessionExternalId },
      employee: { externalId: employeeExternalId },
    },
  })
  return count > 0
}

export const MOVE_FAILURES = [
  'SESSION_NOT_FOUND',
  'SAME_SESSION',
  'DIFFERENT_COURSE',
  'NOT_PLANNED',
  'PAST',
  'NOT_ENOUGH_UNNAMED',
  'TARGET_FULL',
] as const
export type MoveFailure = (typeof MOVE_FAILURES)[number]

/**
 * Moves anonymous seats between two sessions of the same course (repairing overbooking).
 * Named bookings never move: they are people, and only they can be reassigned.
 */
export async function moveSeats(
  fromExternalId: string,
  toExternalId: string,
  count: number,
  options?: RepoOptions & { now?: Date }
): Promise<{ ok: true } | { ok: false; reason: MoveFailure }> {
  if (fromExternalId === toExternalId) return { ok: false, reason: 'SAME_SESSION' }
  const now = options?.now ?? new Date()
  return dbOf(options).$transaction(async tx => {
    const locked = await lockSessions(tx, [fromExternalId, toExternalId])
    const from = locked.get(fromExternalId)
    const to = locked.get(toExternalId)
    if (!from || !to) return { ok: false, reason: 'SESSION_NOT_FOUND' }
    if (from.course_id !== to.course_id) return { ok: false, reason: 'DIFFERENT_COURSE' }
    if (to.status !== 'PLANNED') return { ok: false, reason: 'NOT_PLANNED' }
    if (to.starts_at <= now) return { ok: false, reason: 'PAST' }
    if (!Number.isInteger(count) || count < 1 || count > from.unnamed_bookings)
      return { ok: false, reason: 'NOT_ENOUGH_UNNAMED' }
    if ((await bookedIn(tx, to)) + count > to.capacity) return { ok: false, reason: 'TARGET_FULL' }
    await tx.courseSession.update({
      where: { id: from.id },
      data: { unnamedBookings: { decrement: count } },
    })
    await tx.courseSession.update({
      where: { id: to.id },
      data: { unnamedBookings: { increment: count } },
    })
    return { ok: true }
  })
}

export interface EmployeeBooking {
  sessionExternalId: string
  courseCode: string
  courseName: string
  startsAt: string
  endsAt: string
  room: RoomRef
  source: 'ADVISOR' | 'MANUAL'
}

/** A person's named bookings on sessions that have not started yet, soonest first. */
export async function listEmployeeBookings(
  employeeExternalId: string,
  options?: RepoOptions & { now?: Date }
): Promise<EmployeeBooking[]> {
  const rows = await dbOf(options).sessionAssignment.findMany({
    where: {
      employee: { externalId: employeeExternalId },
      session: { startsAt: { gt: options?.now ?? new Date() } },
    },
    select: {
      source: true,
      session: {
        select: {
          externalId: true,
          startsAt: true,
          endsAt: true,
          room: { select: roomRefSelect },
          course: { select: { code: true, name: true } },
        },
      },
    },
    orderBy: { session: { startsAt: 'asc' } },
  })
  return rows.map(r => ({
    sessionExternalId: r.session.externalId,
    courseCode: r.session.course.code,
    courseName: r.session.course.name,
    startsAt: r.session.startsAt.toISOString(),
    endsAt: r.session.endsAt.toISOString(),
    room: r.session.room,
    source: r.source,
  }))
}
