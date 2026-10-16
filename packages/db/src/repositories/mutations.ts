import { type RoomMismatch, roomMismatch } from '@muni/domain/rooms'
import {
  APP_ID_PREFIX,
  type CompletionCreate,
  completionCreateSchema,
  type CourseEdit,
  courseEditSchema,
  type EmployeeEdit,
  employeeEditSchema,
  type RoomEdit,
  roomSchema,
  type SessionCreate,
  sessionCreateSchema,
  type SessionEdit,
  sessionEditSchema,
} from '@muni/domain/schemas'
import { isoDateToUtc, zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE, isArchived } from './archive'
import { dbOf, type RepoOptions } from './context'

// Mutations. Callers (server actions) must have verified a signed-in user first;
// the input is re-parsed here regardless of what the caller validated.

export async function updateCourse(code: string, input: CourseEdit, options?: RepoOptions) {
  const data = courseEditSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    const course = await tx.course.update({
      where: { code, ...ACTIVE },
      data: {
        name: data.name,
        validityMonths: data.validityMonths,
        sessionMinutes: data.sessionMinutes,
        groupSize: data.groupSize,
        onlineAllowed: data.onlineAllowed,
        // Set by hand now: imports stop deriving the needs from the sessions.
        needsManual: true,
      },
      select: { id: true, code: true },
    })
    await tx.courseCapability.deleteMany({ where: { courseId: course.id } })
    await tx.courseCapability.createMany({
      data: data.capabilities.map(capability => ({ courseId: course.id, capability })),
      skipDuplicates: true,
    })
    return { code: course.code }
  })
}

/** Why a session cannot be saved in the room and time asked for. */
export type SessionProblem =
  | 'ROOM_BUSY'
  | 'ROOM_ONLINE_NOT_ALLOWED'
  | 'ROOM_TOO_SMALL'
  | 'ROOM_MISSING_CAPABILITIES'
  | 'ROOM_ARCHIVED'
  | 'COURSE_ARCHIVED'

export type SessionWrite =
  { ok: true; externalId: string; courseCode: string } | { ok: false; problem: SessionProblem }

const MISMATCH_PROBLEM: Record<RoomMismatch['kind'], SessionProblem> = {
  ONLINE_NOT_ALLOWED: 'ROOM_ONLINE_NOT_ALLOWED',
  TOO_SMALL: 'ROOM_TOO_SMALL',
  MISSING_CAPABILITIES: 'ROOM_MISSING_CAPABILITIES',
}

/**
 * Whether a planned session of the course may take the room at that time: the room suits
 * what the course needs and has a seat for each place the session opens, and no other
 * planned session holds it then. An online room is never taken: it has no walls. Nothing is
 * planned in an archived room or of an archived course. Run inside the transaction that
 * writes, after the sessions lock (archiving a room or course takes it too).
 */
async function sessionProblem(
  tx: Tx,
  session: { courseId: string; roomId: string; startsAt: Date; endsAt: Date; capacity: number },
  self: string | null
): Promise<SessionProblem | null> {
  const [room, course] = await Promise.all([
    tx.room.findUniqueOrThrow({
      where: { id: session.roomId },
      select: {
        id: true,
        name: true,
        kind: true,
        capacity: true,
        capabilities: true,
        archivedAt: true,
      },
    }),
    tx.course.findUniqueOrThrow({
      where: { id: session.courseId },
      select: { groupSize: true, onlineAllowed: true, capabilities: true, archivedAt: true },
    }),
  ])
  if (isArchived(room)) return 'ROOM_ARCHIVED'
  if (isArchived(course)) return 'COURSE_ARCHIVED'
  const mismatch = roomMismatch(
    { ...room, capabilities: room.capabilities.map(c => c.capability) },
    { ...course, capabilities: course.capabilities.map(c => c.capability) },
    session.capacity
  )
  if (mismatch) return MISMATCH_PROBLEM[mismatch.kind]
  if (room.kind === 'ONLINE') return null
  const clash = await tx.courseSession.findFirst({
    where: {
      ...ACTIVE,
      roomId: room.id,
      status: 'PLANNED',
      startsAt: { lt: session.endsAt },
      endsAt: { gt: session.startsAt },
      ...(self && { externalId: { not: self } }),
    },
    select: { id: true },
  })
  return clash ? 'ROOM_BUSY' : null
}

/** Session writes take turns, so two cannot both find a room free and both take it. */
const lockSessions = (tx: Tx) =>
  tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('course_sessions'))`

export async function updateSession(
  externalId: string,
  input: SessionEdit,
  options?: RepoOptions
): Promise<SessionWrite> {
  const data = sessionEditSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    await lockSessions(tx)
    const current = await tx.courseSession.findFirstOrThrow({
      where: { externalId, ...ACTIVE },
      select: { id: true, courseId: true, course: { select: { code: true } } },
    })
    const startsAt = zonedTimeToUtc(data.date, data.startTime)
    const endsAt = zonedTimeToUtc(data.date, data.endTime)
    if (data.status === 'PLANNED') {
      const problem = await sessionProblem(
        tx,
        {
          courseId: current.courseId,
          roomId: data.roomId,
          startsAt,
          endsAt,
          capacity: data.capacity,
        },
        externalId
      )
      if (problem) return { ok: false, problem }
    }
    await tx.courseSession.update({
      where: { id: current.id },
      data: {
        startsAt,
        endsAt,
        room: { connect: { id: data.roomId } },
        capacity: data.capacity,
        unnamedBookings: data.unnamedBookings,
        pricePerPerson: data.pricePerPerson,
        status: data.status,
      },
    })
    return { ok: true, externalId, courseCode: current.course.code }
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
  return dbOf(options).$transaction(async tx => {
    await lockSessions(tx)
    const course = await tx.course.findFirstOrThrow({
      where: { code: data.courseCode, ...ACTIVE },
      select: { id: true, code: true },
    })
    const startsAt = zonedTimeToUtc(data.date, data.startTime)
    const endsAt = zonedTimeToUtc(data.date, data.endTime)
    if (data.status === 'PLANNED') {
      const problem = await sessionProblem(
        tx,
        { courseId: course.id, roomId: data.roomId, startsAt, endsAt, capacity: data.capacity },
        null
      )
      if (problem) return { ok: false, problem }
    }
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
        startsAt,
        endsAt,
        capacity: data.capacity,
        pricePerPerson: data.pricePerPerson,
        status: data.status,
      },
    })
    return { ok: true, externalId, courseCode: course.code }
  })
}

async function writeRoom(
  options: RepoOptions | undefined,
  id: string | null,
  input: RoomEdit
): Promise<{ id: string }> {
  const data = roomSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    const fields = {
      name: data.name,
      kind: data.kind,
      capacity: data.capacity,
      note: cleanFreeText(data.note),
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
    return room
  })
}

export const createRoom = (input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, null, input)

export const updateRoom = (id: string, input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, id, input)

/**
 * An active department's or position's id by name, created when there is none. (An archived
 * one of that name is left alone: a new active one takes the name.)
 */
async function nameId(
  options: RepoOptions | undefined,
  model: 'department' | 'position',
  name: string | null
): Promise<string | null> {
  if (!name) return null
  const db = dbOf(options)
  const delegate = (model === 'department' ? db.department : db.position) as unknown as {
    findFirst(args: object): Promise<{ id: string } | null>
    create(args: object): Promise<{ id: string }>
  }
  return (
    (await delegate.findFirst({ where: { name, ...ACTIVE }, select: { id: true } })) ??
    (await delegate.create({ data: { name }, select: { id: true } }))
  ).id
}

/** An active provider's id by name, created when there is none. */
async function providerId(options: RepoOptions | undefined, name: string): Promise<string> {
  const db = dbOf(options)
  return (
    (await db.provider.findFirst({ where: { name, ...ACTIVE }, select: { id: true } })) ??
    (await db.provider.create({ data: { name }, select: { id: true } }))
  ).id
}

export async function updateEmployee(
  externalId: string,
  input: EmployeeEdit,
  options?: RepoOptions
) {
  const data = employeeEditSchema.parse(input)
  return dbOf(options).employee.update({
    where: { externalId, ...ACTIVE },
    data: {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      departmentId: await nameId(options, 'department', data.department),
      positionId: await nameId(options, 'position', data.position),
      hiredOn: isoDateToUtc(data.hiredOn),
      leftOn: data.leftOn ? isoDateToUtc(data.leftOn) : null,
      status: data.status,
      note: cleanFreeText(data.note),
    },
    select: { externalId: true },
  })
}

/** Records a completion entered in the app. Its ID gets an `A` prefix to keep clear of imports. */
export async function createCompletion(
  employeeExternalId: string,
  input: CompletionCreate,
  options?: RepoOptions
) {
  const data = completionCreateSchema.parse(input)
  const db = dbOf(options)
  const [employee, course] = await Promise.all([
    db.employee.findFirstOrThrow({
      where: { externalId: employeeExternalId, ...ACTIVE },
      select: { id: true },
    }),
    db.course.findFirstOrThrow({
      where: { code: data.courseCode, ...ACTIVE },
      select: { id: true },
    }),
  ])
  const provider = data.provider ? await providerId(options, data.provider) : null
  return db.courseCompletion.create({
    data: {
      externalId:
        `${APP_ID_PREFIX.completion}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
      employeeId: employee.id,
      courseId: course.id,
      completedOn: isoDateToUtc(data.completedOn),
      validUntil: data.validUntil ? isoDateToUtc(data.validUntil) : null,
      providerId: provider,
      price: data.price,
      note: cleanFreeText(data.note),
    },
    select: { externalId: true },
  })
}
