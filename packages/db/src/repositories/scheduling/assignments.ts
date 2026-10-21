import { forecastEnd } from '@muni/domain/advisor'
import { appliesTo, bestCompletion } from '@muni/domain/compliance'
import { sortName } from '@muni/domain/names'
import type { RoomRef } from '@muni/domain/rooms'
import { type IsoDate, isoDateFromUtc } from '@muni/utils/dates'

import type { Prisma } from '../../generated/prisma/client'
import { ACTIVE } from '../archive/archive'
import { audienceSelect, rulesOf } from '../catalog/audience'
import { complianceOptions, dbOf, nowOf, type RepoOptions } from '../core/context'
import { stillEmployed } from '../people/employment'
import { roomRefSelect, toRoomRef, upcomingSessionWhere } from './sessions'

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
  /** Where it was asked from: the advisor, or by hand on a record. Every one is checked alike. */
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

/**
 * Locks the (active) session rows for the rest of the transaction; concurrent writers queue
 * behind them. Archiving a session takes the same lock.
 */
async function lockSessionRows(tx: Tx, externalIds: string[]): Promise<Map<string, LockedSession>> {
  // Id order is the lock order everywhere, so two movers in opposite directions cannot deadlock.
  const rows = await tx.$queryRaw<(LockedSession & { external_id: string })[]>`
    SELECT id, external_id, course_id, capacity, unnamed_bookings, status::text AS status,
           starts_at, ends_at
    FROM course_sessions
    WHERE external_id = ANY(${externalIds}) AND archived_at IS NULL
    ORDER BY id
    FOR UPDATE`
  return new Map(rows.map(r => [r.external_id, r]))
}

/**
 * Locks the (active) people's rows, in id order, after their sessions': a batch takes all its
 * locks up front in the one order every writer uses, so two batches cannot deadlock.
 */
export async function lockPeople(tx: Tx, externalIds: readonly string[]): Promise<void> {
  if (externalIds.length === 0) return
  await tx.$queryRaw`
    SELECT id FROM employees
    WHERE external_id = ANY(${[...new Set(externalIds)]}) AND archived_at IS NULL
    ORDER BY id
    FOR UPDATE`
}

/** A batch of bookings may take a while; the default 5 s is for single writes. */
export const BATCH_TX = { timeout: 60_000, maxWait: 10_000 }

const bookedIn = async (tx: Tx, session: LockedSession) =>
  session.unnamed_bookings +
  (await tx.sessionAssignment.count({ where: { sessionId: session.id } }))

/**
 * Applies the requests in one transaction. A refused request writes nothing, so one refusal
 * never undoes the others; every rule is checked here, against the locked rows, and the
 * client's plan is never trusted. Every session and person is locked once, up front.
 */
export async function applyAssignments(
  requests: AssignmentRequest[],
  userId: string,
  options?: RepoOptions
): Promise<AssignmentOutcome[]> {
  const now = nowOf(options)
  return dbOf(options).$transaction(async tx => {
    await lockSessionRows(
      tx,
      requests.map(r => r.sessionExternalId)
    )
    await lockPeople(
      tx,
      requests.map(r => r.employeeExternalId)
    )
    const outcomes: AssignmentOutcome[] = []
    for (const request of requests) {
      const reason = await applyOne(tx, request, userId, now, options?.asOf)
      outcomes.push(reason === null ? { request, ok: true } : { request, ok: false, reason })
    }
    return outcomes
  }, BATCH_TX)
}

/**
 * Books one person, inside the caller's transaction: every rule is checked against the
 * locked session and person. Null when booked; otherwise why not (nothing is written).
 */
export async function applyOne(
  tx: Tx,
  request: AssignmentRequest,
  userId: string,
  now: Date,
  asOf: IsoDate | undefined
): Promise<AssignmentFailure | null> {
  const session = (await lockSessionRows(tx, [request.sessionExternalId])).get(
    request.sessionExternalId
  )
  if (!session) return 'SESSION_NOT_FOUND'
  const employee = await tx.employee.findFirst({
    where: { externalId: request.employeeExternalId, ...ACTIVE },
    select: { id: true, status: true, leftOn: true, departmentId: true, positionId: true },
  })
  if (!employee) return 'EMPLOYEE_NOT_FOUND'
  // Gone by the session's day: their leaving date is that day or earlier.
  if (employee.leftOn && employee.leftOn <= session.starts_at) return 'INACTIVE'
  if (session.status !== 'PLANNED') return 'NOT_PLANNED'
  if (session.starts_at <= now) return 'PAST'
  // The person's row too (always after the session's): two concurrent applies for one person
  // into overlapping sessions would otherwise both pass the clash check. Archiving the person
  // takes this lock as well, so re-check after it: they may have been archived meanwhile.
  const [locked] = await tx.$queryRaw<{ archived_at: Date | null }[]>`
    SELECT archived_at FROM employees WHERE id = ${employee.id} FOR UPDATE`
  if (locked?.archived_at) return 'EMPLOYEE_NOT_FOUND'

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
        ...ACTIVE,
        status: 'PLANNED',
        startsAt: { lt: session.ends_at },
        endsAt: { gt: session.starts_at },
      },
    },
    select: { id: true },
  })
  if (clash) return 'CONFLICT'

  // Only what is required and due: a training held beyond the advisor's forecast waits.
  const course = await tx.course.findUniqueOrThrow({
    where: { id: session.course_id },
    select: { id: true, ...audienceSelect },
  })
  if (!rulesOf(course).some(r => appliesTo(r, employee))) return 'NOT_REQUIRED'
  const completions = await tx.courseCompletion.findMany({
    where: { ...ACTIVE, employeeId: employee.id, courseId: session.course_id },
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

  await tx.sessionAssignment.create({
    data: {
      sessionId: session.id,
      employeeId: employee.id,
      source: request.source,
      createdById: userId,
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
      session: { externalId: sessionExternalId, ...ACTIVE },
      employee: { externalId: employeeExternalId, ...ACTIVE },
    },
  })
  return count > 0
}

export type MoveFailure =
  | 'SESSION_NOT_FOUND'
  | 'SAME_SESSION'
  | 'DIFFERENT_COURSE'
  | 'NOT_PLANNED'
  | 'PAST'
  | 'NOT_ENOUGH_UNNAMED'
  | 'TARGET_FULL'

/** One destination of anonymous seats. */
export interface SeatMoveRequest {
  to: string
  count: number
}

export type MoveOutcome =
  | { ok: true; moved: number }
  | { ok: false; reason: MoveFailure; /** The destination refused, if one was. */ to?: string }

/**
 * Moves anonymous seats out of a session into others of the same course (repairing
 * overbooking), all in one transaction: every destination is checked before anything is
 * written, so the seats move as asked or not at all. Named bookings never move: they are
 * people, and only they can be reassigned.
 */
export async function moveSeatsMany(
  fromExternalId: string,
  moves: SeatMoveRequest[],
  options?: RepoOptions
): Promise<MoveOutcome> {
  // One entry per destination, in a stable order.
  const wanted = new Map<string, number>()
  for (const { to, count } of moves) wanted.set(to, (wanted.get(to) ?? 0) + count)
  if (wanted.has(fromExternalId)) return { ok: false, reason: 'SAME_SESSION' }
  const total = [...wanted.values()].reduce((n, c) => n + c, 0)
  const now = nowOf(options)
  return dbOf(options).$transaction(async (tx): Promise<MoveOutcome> => {
    const locked = await lockSessionRows(tx, [fromExternalId, ...wanted.keys()])
    const from = locked.get(fromExternalId)
    if (!from) return { ok: false, reason: 'SESSION_NOT_FOUND' }
    // Seats leave only a session still ahead: a past or cancelled one keeps its history.
    if (from.status !== 'PLANNED') return { ok: false, reason: 'NOT_PLANNED' }
    if (from.starts_at <= now) return { ok: false, reason: 'PAST' }
    const targets: { to: string; session: LockedSession; count: number }[] = []
    for (const [to, count] of wanted) {
      const session = locked.get(to)
      if (!session) return { ok: false, reason: 'SESSION_NOT_FOUND', to }
      if (from.course_id !== session.course_id) return { ok: false, reason: 'DIFFERENT_COURSE', to }
      if (session.status !== 'PLANNED') return { ok: false, reason: 'NOT_PLANNED', to }
      if (session.starts_at <= now) return { ok: false, reason: 'PAST', to }
      if (!Number.isInteger(count) || count < 1)
        return { ok: false, reason: 'NOT_ENOUGH_UNNAMED', to }
      targets.push({ to, session, count })
    }
    if (total < 1 || total > from.unnamed_bookings)
      return { ok: false, reason: 'NOT_ENOUGH_UNNAMED' }
    for (const { to, session, count } of targets) {
      if ((await bookedIn(tx, session)) + count > session.capacity)
        return { ok: false, reason: 'TARGET_FULL', to }
    }
    await tx.courseSession.update({
      where: { id: from.id },
      data: { unnamedBookings: { decrement: total } },
    })
    for (const { session, count } of targets) {
      await tx.courseSession.update({
        where: { id: session.id },
        data: { unnamedBookings: { increment: count } },
      })
    }
    return { ok: true, moved: total }
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

/** Whose upcoming bookings: a department's or a position's people. */
export type BookingsOf = { department: string } | { position: string }

/** A booking on a session still ahead, with whom it is for. */
export interface UpcomingBooking extends EmployeeBooking {
  person: { externalId: string; name: string }
}

/**
 * Named bookings on sessions still ahead (planned, not yet ended: `upcomingSessionWhere`, as
 * every count of them), soonest first: those of the people a department or a position has now
 * (not left), as its "upcoming bookings" counts them. (A person's own show on their
 * requirements.)
 */
export async function listUpcomingBookings(
  of: BookingsOf,
  options?: RepoOptions & { asOf?: IsoDate }
): Promise<UpcomingBooking[]> {
  const employee = {
    ...ACTIVE,
    ...stillEmployed(options?.asOf),
    ...('department' in of ? { departmentId: of.department } : { positionId: of.position }),
  }
  const rows = await dbOf(options).sessionAssignment.findMany({
    where: { employee, session: upcomingSessionWhere(nowOf(options)) },
    select: {
      source: true,
      employee: { select: { externalId: true, firstName: true, lastName: true } },
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
    orderBy: [{ session: { startsAt: 'asc' } }, { session: { externalId: 'asc' } }],
  })
  return rows.map(r => ({
    sessionExternalId: r.session.externalId,
    courseCode: r.session.course.code,
    courseName: r.session.course.name,
    startsAt: r.session.startsAt.toISOString(),
    endsAt: r.session.endsAt.toISOString(),
    room: toRoomRef(r.session.room),
    source: r.source,
    person: { externalId: r.employee.externalId, name: sortName(r.employee) },
  }))
}
