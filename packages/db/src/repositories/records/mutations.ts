import type { RoomMismatch } from '@muni/domain/rooms'
import {
  APP_ID_PREFIX,
  type RoomEdit,
  roomSchema,
  type SessionCreate,
  sessionCreateSchema,
  type SessionEdit,
  sessionEditSchema,
} from '@muni/domain/schemas'
import { sessionEnd, sessionIssues, sessionPhase, startsLater } from '@muni/domain/sessions'
import { zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../../client'
import type { Prisma } from '../../generated/prisma/client'
import { ACTIVE, isArchived } from '../archive/archive'
import { dbOf, type RepoOptions } from '../core/context'
import { applyOne, type AssignmentFailure, BATCH_TX, lockPeople } from '../scheduling/assignments'
import {
  lockSessionWrites,
  needsOf,
  needsSelect,
  newlyUnfit,
  roomFactsOf,
  roomFactsSelect,
} from '../scheduling/session-fit'

// Mutations. Callers (server actions) must have verified a signed-in user first;
// the input is re-parsed here regardless of what the caller validated.

/** Why a session cannot be saved in the room and time asked for. */
export type SessionProblem =
  | 'ROOM_BUSY'
  | 'ROOM_ONLINE_NOT_ALLOWED'
  | 'ROOM_TOO_SMALL'
  | 'ROOM_MISSING_CAPABILITIES'
  | 'ROOM_ARCHIVED'
  | 'COURSE_ARCHIVED'
  /** The course has no length set: when it would end is unknown. */
  | 'NO_LENGTH'
  /** The provider does not offer the course (or no longer exists). */
  | 'NOT_OFFERED'
  | 'PROVIDER_ARCHIVED'
  /** Fewer seats than are booked (unnamed and named together). */
  | 'OVER_CAPACITY'
  /** Someone booked by name has another planned session at the new time. */
  | 'ATTENDEE_CONFLICT'

export type SessionWrite =
  { ok: true; externalId: string; courseCode: string } | { ok: false; problem: SessionProblem }

const MISMATCH_PROBLEM: Record<RoomMismatch['kind'], SessionProblem> = {
  ONLINE_NOT_ALLOWED: 'ROOM_ONLINE_NOT_ALLOWED',
  TOO_SMALL: 'ROOM_TOO_SMALL',
  MISSING_CAPABILITIES: 'ROOM_MISSING_CAPABILITIES',
}

interface SessionFacts {
  courseId: string
  roomId: string
  startsAt: Date
  endsAt: Date
  capacity: number
  /** Unnamed plus named bookings. */
  booked: number
  planned: boolean
}

/** Whether another planned session holds the room then. An online room is never taken. */
async function roomBusy(
  tx: Tx,
  session: Pick<SessionFacts, 'roomId' | 'startsAt' | 'endsAt'>,
  self: string | null
): Promise<boolean> {
  const clash = await tx.courseSession.findFirst({
    where: {
      ...ACTIVE,
      roomId: session.roomId,
      room: { kind: { not: 'ONLINE' } },
      status: 'PLANNED',
      startsAt: { lt: session.endsAt },
      endsAt: { gt: session.startsAt },
      ...(self && { externalId: { not: self } }),
    },
    select: { id: true },
  })
  return clash !== null
}

/**
 * Whether the session may be saved so: its seats hold its bookings; when planned, the room
 * suits what the course needs and has a seat for each place, and no other planned session
 * holds it then (`sessionIssues`, which the form runs as the user types, plus the clash).
 * Nothing moves into an archived room or to an archived course; a session already there
 * (a past one) keeps it. Run inside the transaction that writes, after the sessions lock
 * (archiving a room or course takes it too).
 */
async function sessionProblem(
  tx: Tx,
  session: SessionFacts,
  current: { externalId: string; courseId: string; roomId: string } | null
): Promise<SessionProblem | null> {
  const [room, course] = await Promise.all([
    tx.room.findUniqueOrThrow({
      where: { id: session.roomId },
      select: { ...roomFactsSelect, archivedAt: true },
    }),
    tx.course.findUniqueOrThrow({
      where: { id: session.courseId },
      select: { ...needsSelect, archivedAt: true },
    }),
  ])
  if (isArchived(room) && room.id !== current?.roomId) return 'ROOM_ARCHIVED'
  if (isArchived(course) && session.courseId !== current?.courseId) return 'COURSE_ARCHIVED'
  for (const issue of sessionIssues({
    // The length and the offering are settled by `derive`, before.
    minutes: undefined,
    offered: undefined,
    capacity: session.capacity,
    booked: session.booked,
    planned: session.planned,
    room: roomFactsOf(room),
    needs: needsOf(course),
  })) {
    if (issue.kind === 'BELOW_BOOKED') return 'OVER_CAPACITY'
    if (issue.kind === 'ROOM') return MISMATCH_PROBLEM[issue.mismatch.kind]
  }
  if (session.planned && (await roomBusy(tx, session, current?.externalId ?? null)))
    return 'ROOM_BUSY'
  return null
}

/** A session as stored, for what `derive` keeps when nothing it follows from changed. */
interface StoredOffer {
  courseId: string
  providerId: string
  startsAt: Date
  endsAt: Date
  pricePerPerson: Prisma.Decimal | null
}

/**
 * What a session's course and provider make of it: it ends its course's length after it starts,
 * and costs the provider's price for the course. Kept as stored when what they follow from is
 * unchanged (an imported session keeps its exported end and price until it is moved or given
 * another course or provider). Refused when the course has no length, or the provider is
 * archived or does not offer the course.
 */
async function derive(
  tx: Tx,
  data: { courseId: string; providerId: string; date: string; startTime: string },
  current: StoredOffer | null
): Promise<
  | { ok: true; startsAt: Date; endsAt: Date; pricePerPerson: Prisma.Decimal | null }
  | { ok: false; problem: SessionProblem }
> {
  const startsAt = zonedTimeToUtc(data.date, data.startTime)
  // One after another: a transaction's queries share one connection.
  const course = await tx.course.findUniqueOrThrow({
    where: { id: data.courseId },
    select: { sessionMinutes: true },
  })
  const provider = await tx.provider.findUnique({
    where: { id: data.providerId },
    select: { archivedAt: true },
  })
  const offering = await tx.providerCourse.findUnique({
    where: { providerId_courseId: { providerId: data.providerId, courseId: data.courseId } },
    select: { pricePerPerson: true },
  })
  const sameOffer =
    current !== null && current.courseId === data.courseId && current.providerId === data.providerId
  if (!provider) return { ok: false, problem: 'NOT_OFFERED' }
  if (!sameOffer && isArchived(provider)) return { ok: false, problem: 'PROVIDER_ARCHIVED' }
  if (!sameOffer && !offering) return { ok: false, problem: 'NOT_OFFERED' }
  const sameTime =
    current !== null &&
    current.courseId === data.courseId &&
    current.startsAt.getTime() === startsAt.getTime()
  if (!sameTime && course.sessionMinutes === null) return { ok: false, problem: 'NO_LENGTH' }
  return {
    ok: true,
    startsAt,
    endsAt:
      sameTime || course.sessionMinutes === null
        ? (current?.endsAt ?? startsAt)
        : sessionEnd(startsAt, course.sessionMinutes),
    pricePerPerson: sameOffer ? current.pricePerPerson : (offering?.pricePerPerson ?? null),
  }
}

const storedSelect = {
  id: true,
  externalId: true,
  courseId: true,
  roomId: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  unnamedBookings: true,
  status: true,
  course: { select: { code: true } },
  _count: { select: { assignments: true } },
} as const

type StoredSession = Prisma.CourseSessionGetPayload<{ select: typeof storedSelect }>

/** What stops a stored session from standing as a planned one where and when it is. */
function plannedProblem(tx: Tx, session: StoredSession): Promise<SessionProblem | null> {
  return sessionProblem(
    tx,
    {
      courseId: session.courseId,
      roomId: session.roomId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      capacity: session.capacity,
      booked: session.unnamedBookings + session._count.assignments,
      planned: true,
    },
    { externalId: session.externalId, courseId: session.courseId, roomId: session.roomId }
  )
}

/**
 * What stops a stored session from standing as it is now: for a session being brought back
 * from the archive, whose room may since have been taken or changed. Past and cancelled
 * sessions hold nothing. Run after the sessions lock.
 */
export async function storedSessionProblem(
  tx: Tx,
  id: string,
  now: Date
): Promise<SessionProblem | null> {
  const session = await tx.courseSession.findUniqueOrThrow({ where: { id }, select: storedSelect })
  if (session.status !== 'PLANNED' || session.endsAt < now) return null
  return plannedProblem(tx, session)
}

/**
 * Whether the room is free then, for the session form to say while the user picks (no lock:
 * saving checks again). `self` is the session being edited, which never clashes with itself.
 */
export async function checkSessionSlot(
  input: { roomId: string; date: string; startTime: string; endTime: string },
  self: string | null,
  options?: RepoOptions
): Promise<'ROOM_BUSY' | null> {
  const startsAt = zonedTimeToUtc(input.date, input.startTime)
  const endsAt = zonedTimeToUtc(input.date, input.endTime)
  if (!(endsAt > startsAt)) return null
  return dbOf(options).$transaction(async tx =>
    (await roomBusy(tx, { roomId: input.roomId, startsAt, endsAt }, self)) ? 'ROOM_BUSY' : null
  )
}

/**
 * Whether someone booked on the session by name has another planned session overlapping the
 * new time. Their rows are locked first, as booking locks them, so no clash is booked meanwhile.
 */
async function attendeeClash(tx: Tx, sessionId: string, startsAt: Date, endsAt: Date) {
  await tx.$queryRaw`
    SELECT e.id FROM employees e
    JOIN session_assignments a ON a.employee_id = e.id AND a.session_id = ${sessionId}
    ORDER BY e.id FOR UPDATE OF e`
  const clash = await tx.sessionAssignment.findFirst({
    where: {
      employee: { assignments: { some: { sessionId } } },
      session: {
        ...ACTIVE,
        id: { not: sessionId },
        status: 'PLANNED',
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    },
    select: { id: true },
  })
  return clash !== null
}

export async function updateSession(
  externalId: string,
  input: SessionEdit,
  options?: RepoOptions
): Promise<SessionWrite> {
  const data = sessionEditSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    await lockSessionWrites(tx)
    const found = await tx.courseSession.findFirstOrThrow({
      where: { externalId, ...ACTIVE },
      select: { id: true },
    })
    // The row too, as booking takes it: a seat booked meanwhile is counted below.
    await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${found.id} FOR UPDATE`
    const current = await tx.courseSession.findUniqueOrThrow({
      where: { id: found.id },
      select: {
        id: true,
        courseId: true,
        roomId: true,
        providerId: true,
        status: true,
        startsAt: true,
        endsAt: true,
        pricePerPerson: true,
      },
    })
    const named = await tx.sessionAssignment.count({ where: { sessionId: current.id } })
    const derived = await derive(tx, data, current)
    if (!derived.ok) return derived
    const { startsAt, endsAt } = derived
    const problem = await sessionProblem(
      tx,
      {
        courseId: data.courseId,
        roomId: data.roomId,
        startsAt,
        endsAt,
        capacity: data.capacity,
        booked: data.unnamedBookings + named,
        // Its status stays: a cancelled one holds no room, wherever it is moved.
        planned: current.status === 'PLANNED',
      },
      { externalId, courseId: current.courseId, roomId: current.roomId }
    )
    if (problem) return { ok: false, problem }
    if (
      current.status === 'PLANNED' &&
      named > 0 &&
      (await attendeeClash(tx, current.id, startsAt, endsAt))
    )
      return { ok: false, problem: 'ATTENDEE_CONFLICT' }
    const saved = await tx.courseSession.update({
      where: { id: current.id },
      data: {
        startsAt,
        endsAt,
        course: { connect: { id: data.courseId } },
        room: { connect: { id: data.roomId } },
        provider: { connect: { id: data.providerId } },
        capacity: data.capacity,
        unnamedBookings: data.unnamedBookings,
        pricePerPerson: derived.pricePerPerson,
      },
      select: { course: { select: { code: true } } },
    })
    return { ok: true, externalId, courseCode: saved.course.code }
  })
}

/** Why a session cannot be cancelled or reinstated. */
export type SessionStatusRefusal =
  | 'NOT_FOUND'
  /** Cancelling one already cancelled, or reinstating one that is planned. */
  | 'UNCHANGED'
  /** It has started: what happened stays as it was. */
  | 'STARTED'

export type SessionStatusWrite =
  | { ok: true; externalId: string; courseCode: string }
  | { ok: false; problem: SessionStatusRefusal | SessionProblem }

/** Locks the sessions and the session's row, then reads it as it is under the lock. */
async function lockedSession(tx: Tx, externalId: string): Promise<StoredSession | null> {
  await lockSessionWrites(tx)
  const found = await tx.courseSession.findFirst({
    where: { externalId, ...ACTIVE },
    select: { id: true },
  })
  if (!found) return null
  await tx.$queryRaw`SELECT id FROM course_sessions WHERE id = ${found.id} FOR UPDATE`
  return tx.courseSession.findUniqueOrThrow({ where: { id: found.id }, select: storedSelect })
}

/**
 * Cancels a session still to start. Its bookings stay, as the record of who was to come; the
 * advisor counts none of them, so those people need a session again. A session that has
 * started stays as it is.
 */
export async function cancelSession(
  externalId: string,
  options?: RepoOptions & { now?: Date }
): Promise<SessionStatusWrite> {
  const now = options?.now ?? new Date()
  return dbOf(options).$transaction(async tx => {
    const session = await lockedSession(tx, externalId)
    if (!session) return { ok: false, problem: 'NOT_FOUND' }
    const phase = sessionPhase(session, now)
    if (phase === 'CANCELLED') return { ok: false, problem: 'UNCHANGED' }
    if (phase !== 'AHEAD') return { ok: false, problem: 'STARTED' }
    await tx.courseSession.update({ where: { id: session.id }, data: { status: 'CANCELLED' } })
    return { ok: true, externalId, courseCode: session.course.code }
  })
}

/**
 * Plans a cancelled session again, if it is still to start and could be saved so now: its
 * room free and suited, and nobody booked on it elsewhere at that time.
 */
export async function reinstateSession(
  externalId: string,
  options?: RepoOptions & { now?: Date }
): Promise<SessionStatusWrite> {
  const now = options?.now ?? new Date()
  return dbOf(options).$transaction(async tx => {
    const session = await lockedSession(tx, externalId)
    if (!session) return { ok: false, problem: 'NOT_FOUND' }
    if (session.status !== 'CANCELLED') return { ok: false, problem: 'UNCHANGED' }
    if (!startsLater(session, now)) return { ok: false, problem: 'STARTED' }
    const problem = await plannedProblem(tx, session)
    if (problem) return { ok: false, problem }
    if (
      session._count.assignments > 0 &&
      (await attendeeClash(tx, session.id, session.startsAt, session.endsAt))
    )
      return { ok: false, problem: 'ATTENDEE_CONFLICT' }
    await tx.courseSession.update({ where: { id: session.id }, data: { status: 'PLANNED' } })
    return { ok: true, externalId, courseCode: session.course.code }
  })
}

/**
 * Schedules a new session with no bookings. Its ID takes the app's own prefix (S001, S002,
 * …), which imports refuse, so a later export can never overwrite it.
 */
export async function createSession(
  input: SessionCreate,
  options?: RepoOptions
): Promise<SessionWrite> {
  const data = sessionCreateSchema.parse(input)
  return dbOf(options).$transaction(tx => insertSession(tx, data))
}

/** Creates the session inside the caller's transaction, after the same checks. */
async function insertSession(tx: Tx, data: SessionCreate): Promise<SessionWrite> {
  await lockSessionWrites(tx)
  const course = await tx.course.findUniqueOrThrow({
    where: { id: data.courseId },
    select: { id: true, code: true },
  })
  const derived = await derive(tx, data, null)
  if (!derived.ok) return derived
  const { startsAt, endsAt } = derived
  const problem = await sessionProblem(
    tx,
    {
      courseId: course.id,
      roomId: data.roomId,
      startsAt,
      endsAt,
      capacity: data.capacity,
      booked: 0,
      planned: true,
    },
    null
  )
  if (problem) return { ok: false, problem }
  const ids = await tx.courseSession.findMany({
    // eslint-disable-next-line no-restricted-syntax -- archived ones count: an ID is never reused
    where: { externalId: { startsWith: APP_ID_PREFIX.session } },
    select: { externalId: true },
  })
  const next = Math.max(0, ...ids.map(s => Number(s.externalId.slice(1)) || 0)) + 1
  const externalId = `${APP_ID_PREFIX.session}${String(next).padStart(3, '0')}`
  await tx.courseSession.create({
    data: {
      externalId,
      courseId: course.id,
      roomId: data.roomId,
      providerId: data.providerId,
      startsAt,
      endsAt,
      capacity: data.capacity,
      pricePerPerson: derived.pricePerPerson,
      status: 'PLANNED',
    },
  })
  return { ok: true, externalId, courseCode: course.code }
}

/** A planned session and the people booked on it, or why it would not go through. */
export type PlannedSessionWrite =
  | { ok: true; externalId: string; courseCode: string; booked: number; dryRun: boolean }
  | {
      ok: false
      /** The session itself cannot be saved so (null: it can, but people were refused). */
      problem: SessionProblem | null
      refusals: { employeeExternalId: string; reason: AssignmentFailure }[]
    }

/** Unwinds the transaction while carrying its answer out. */
class Rollback extends Error {
  constructor(readonly result: PlannedSessionWrite) {
    super('rollback')
  }
}

/**
 * Creates a session and books the chosen people on it, all or nothing: if the session cannot
 * be saved, or any person cannot be booked (a clash, no longer employed, …), nothing is
 * written and the answer says why. `dryRun` runs every check the same way and then undoes it:
 * what the planner's review shows before the user confirms.
 */
export async function createSessionWithBookings(
  input: SessionCreate,
  people: readonly string[],
  userId: string,
  options?: RepoOptions & { now?: Date; dryRun?: boolean }
): Promise<PlannedSessionWrite> {
  const data = sessionCreateSchema.parse(input)
  const now = options?.now ?? new Date()
  try {
    return await dbOf(options).$transaction(async tx => {
      const created = await insertSession(tx, data)
      if (!created.ok) throw new Rollback({ ok: false, problem: created.problem, refusals: [] })
      const refusals: { employeeExternalId: string; reason: AssignmentFailure }[] = []
      await lockPeople(tx, people)
      for (const employeeExternalId of new Set(people)) {
        const reason = await applyOne(
          tx,
          { sessionExternalId: created.externalId, employeeExternalId, source: 'ADVISOR' },
          userId,
          now,
          options?.asOf
        )
        if (reason) refusals.push({ employeeExternalId, reason })
      }
      if (refusals.length > 0) throw new Rollback({ ok: false, problem: null, refusals })
      const result: PlannedSessionWrite = {
        ok: true,
        externalId: created.externalId,
        courseCode: created.courseCode,
        booked: new Set(people).size,
        dryRun: options?.dryRun ?? false,
      }
      if (options?.dryRun) throw new Rollback(result)
      return result
    }, BATCH_TX)
  } catch (error) {
    if (error instanceof Rollback) return error.result
    throw error
  }
}

/** Why a session's capacity was not raised. */
export type RaiseProblem = SessionProblem | 'NOT_FOUND' | 'NOT_RAISED'

/**
 * Raises a session's capacity (repairing overbooking), when its room has the seats: the same
 * checks as saving the session, under the same lock.
 */
export async function raiseCapacity(
  externalId: string,
  capacity: number,
  options?: RepoOptions
): Promise<{ ok: true } | { ok: false; problem: RaiseProblem }> {
  return dbOf(options).$transaction(async tx => {
    await lockSessionWrites(tx)
    const session = await tx.courseSession.findFirst({
      where: { externalId, ...ACTIVE },
      select: {
        id: true,
        courseId: true,
        roomId: true,
        startsAt: true,
        endsAt: true,
        capacity: true,
        unnamedBookings: true,
        status: true,
        _count: { select: { assignments: true } },
      },
    })
    if (!session) return { ok: false, problem: 'NOT_FOUND' }
    if (!Number.isInteger(capacity) || capacity <= session.capacity)
      return { ok: false, problem: 'NOT_RAISED' }
    const problem = await sessionProblem(
      tx,
      {
        courseId: session.courseId,
        roomId: session.roomId,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
        capacity,
        booked: session.unnamedBookings + session._count.assignments,
        planned: session.status === 'PLANNED',
      },
      { externalId, courseId: session.courseId, roomId: session.roomId }
    )
    if (problem) return { ok: false, problem }
    await tx.courseSession.update({ where: { id: session.id }, data: { capacity } })
    return { ok: true }
  })
}

/** Why a room edit was refused: upcoming sessions there would stop fitting. */
export type RoomWrite =
  | { ok: true; id: string }
  | {
      ok: false
      field: 'capacity' | 'capabilities' | 'kind'
      reason: 'sessions_unfit'
      count: number
    }

const UNFIT_FIELD = {
  TOO_SMALL: 'capacity',
  MISSING_CAPABILITIES: 'capabilities',
  ONLINE_NOT_ALLOWED: 'kind',
} as const

async function writeRoom(
  options: RepoOptions | undefined,
  id: string | null,
  input: RoomEdit
): Promise<RoomWrite> {
  const data = roomSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    const fields = {
      name: data.name,
      kind: data.kind,
      capacity: data.capacity,
      note: cleanFreeText(data.note),
    }
    if (id) {
      await lockSessionWrites(tx)
      const current = await tx.room.findFirstOrThrow({
        where: { id, ...ACTIVE },
        select: roomFactsSelect,
      })
      const before = roomFactsOf(current)
      const unfit = await newlyUnfit(tx, {
        roomId: id,
        room: {
          ...before,
          ...fields,
          capabilities: data.capabilities ?? before.capabilities,
        },
      })
      const first = unfit[0]
      if (first)
        return {
          ok: false,
          field: UNFIT_FIELD[first.kind],
          reason: 'sessions_unfit',
          count: unfit.length,
        }
    }
    const room = id
      ? await tx.room.update({ where: { id, ...ACTIVE }, data: fields, select: { id: true } })
      : await tx.room.create({ data: fields, select: { id: true } })
    if (data.capabilities !== null) {
      await tx.roomCapability.deleteMany({ where: { roomId: room.id } })
      await tx.roomCapability.createMany({
        data: data.capabilities.map(capability => ({ roomId: room.id, capability })),
        skipDuplicates: true,
      })
    }
    return { ok: true, id: room.id }
  })
}

/** A new room. Nothing is planned in it yet, so nothing can stop fitting: it is always saved. */
export const createRoom = (input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, null, input) as Promise<Extract<RoomWrite, { ok: true }>>

/**
 * Saves a room. Refused when upcoming sessions that fit it would stop fitting (fewer seats,
 * equipment taken away, or made online for a course that cannot be).
 */
export const updateRoom = (id: string, input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, id, input)
