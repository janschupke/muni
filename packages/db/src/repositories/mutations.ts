import {
  completionCreateSchema,
  courseEditSchema,
  employeeEditSchema,
  roomSchema,
  sessionCreateSchema,
  sessionEditSchema,
  type CompletionCreate,
  type CourseEdit,
  type EmployeeEdit,
  type RoomEdit,
  type SessionCreate,
  type SessionEdit,
} from '@muni/domain/schemas'
import { isoDateToUtc, zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import { dbOf, type RepoOptions } from './context'

// Mutations. Callers (server actions) must have verified a signed-in user first;
// the input is re-parsed here regardless of what the caller validated.

export async function updateCourse(code: string, input: CourseEdit, options?: RepoOptions) {
  const data = courseEditSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    const course = await tx.course.update({
      where: { code },
      data: {
        name: data.name,
        validityMonths: data.validityMonths,
        sessionMinutes: data.sessionMinutes,
        groupSize: data.groupSize,
        onlineAllowed: data.onlineAllowed,
      },
      select: { id: true, code: true },
    })
    await tx.courseCapability.deleteMany({ where: { courseId: course.id } })
    await tx.courseCapability.createMany({
      data: data.capabilities.map(capability => ({ courseId: course.id, capability })),
    })
    return { code: course.code }
  })
}

export async function updateSession(externalId: string, input: SessionEdit, options?: RepoOptions) {
  const data = sessionEditSchema.parse(input)
  return dbOf(options).courseSession.update({
    where: { externalId },
    data: {
      startsAt: zonedTimeToUtc(data.date, data.startTime),
      endsAt: zonedTimeToUtc(data.date, data.endTime),
      room: { connect: { id: data.roomId } },
      capacity: data.capacity,
      unnamedBookings: data.unnamedBookings,
      pricePerPerson: data.pricePerPerson,
      status: data.status,
    },
    select: { externalId: true, course: { select: { code: true } } },
  })
}

/**
 * Schedules a new session with no bookings. Its ID continues the export's numbering
 * (T034 → T035); a transaction-scoped advisory lock makes concurrent creates take turns.
 */
export async function createSession(input: SessionCreate, options?: RepoOptions) {
  const data = sessionCreateSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('course_sessions.external_id'))`
    const ids = await tx.courseSession.findMany({
      where: { externalId: { startsWith: 'T' } },
      select: { externalId: true },
    })
    const next = Math.max(0, ...ids.map(s => Number(s.externalId.slice(1)) || 0)) + 1
    return tx.courseSession.create({
      data: {
        externalId: `T${String(next).padStart(3, '0')}`,
        course: { connect: { code: data.courseCode } },
        room: { connect: { id: data.roomId } },
        startsAt: zonedTimeToUtc(data.date, data.startTime),
        endsAt: zonedTimeToUtc(data.date, data.endTime),
        capacity: data.capacity,
        pricePerPerson: data.pricePerPerson,
        status: data.status,
      },
      select: { externalId: true, course: { select: { code: true } } },
    })
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
      ? await tx.room.update({ where: { id }, data: fields, select: { id: true } })
      : await tx.room.create({ data: fields, select: { id: true } })
    await tx.roomCapability.deleteMany({ where: { roomId: room.id } })
    await tx.roomCapability.createMany({
      data: data.capabilities.map(capability => ({ roomId: room.id, capability })),
    })
    return room
  })
}

export const createRoom = (input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, null, input)

export const updateRoom = (id: string, input: RoomEdit, options?: RepoOptions) =>
  writeRoom(options, id, input)

/** Deletes a room nobody uses; a room with sessions (past ones too) is kept. */
export async function deleteRoom(id: string, options?: RepoOptions): Promise<'DELETED' | 'IN_USE'> {
  const db = dbOf(options)
  const used = await db.courseSession.count({ where: { roomId: id } })
  if (used > 0) return 'IN_USE'
  await db.room.delete({ where: { id } })
  return 'DELETED'
}

async function nameId(
  options: RepoOptions | undefined,
  model: 'department' | 'position',
  name: string | null
): Promise<string | null> {
  if (!name) return null
  const db = dbOf(options)
  const row =
    model === 'department'
      ? await db.department.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true },
        })
      : await db.position.upsert({
          where: { name },
          create: { name },
          update: {},
          select: { id: true },
        })
  return row.id
}

export async function updateEmployee(
  externalId: string,
  input: EmployeeEdit,
  options?: RepoOptions
) {
  const data = employeeEditSchema.parse(input)
  return dbOf(options).employee.update({
    where: { externalId },
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
    db.employee.findUniqueOrThrow({
      where: { externalId: employeeExternalId },
      select: { id: true },
    }),
    db.course.findUniqueOrThrow({ where: { code: data.courseCode }, select: { id: true } }),
  ])
  const provider = data.provider
    ? await db.provider.upsert({
        where: { name: data.provider },
        create: { name: data.provider },
        update: {},
        select: { id: true },
      })
    : null
  return db.courseCompletion.create({
    data: {
      externalId: `A${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
      employeeId: employee.id,
      courseId: course.id,
      completedOn: isoDateToUtc(data.completedOn),
      validUntil: data.validUntil ? isoDateToUtc(data.validUntil) : null,
      providerId: provider?.id ?? null,
      price: data.price,
      note: cleanFreeText(data.note),
    },
    select: { externalId: true },
  })
}
