import { roomKindOfName } from '@muni/domain/rooms'
import {
  APP_ID_PREFIX,
  type CompletionInput,
  completionSchema,
  type CourseInput,
  courseSchema,
  type EmployeeInput,
  employeeSchema,
  type RoomInput,
  roomSchema,
  type SessionInput,
  sessionSchema,
} from '@muni/domain/schemas'
import type { DatasetKind, DatasetRecord } from '@muni/importer'
import { isoDateToUtc, zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText, fold } from '@muni/utils/text'
import type * as z from 'zod'

import type { Db, Tx } from './client'
import { ACTIVE } from './repositories/archive'
import { lockSessions, newlyUnfit, roomFactsOf, roomFactsSelect } from './repositories/session-fit'

export const COMMIT_CHUNK_SIZE = 500
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 }

export interface CommitResult {
  created: number
  updated: number
  /** Records left alone because they are, or refer to, something archived. */
  skipped: number
}

// Every lookup here is among active records: an archived record's name, code or ID is free for
// a new one. A record whose own key, or anything it refers to, matches ONLY archived records is
// skipped (the review shows it as ARCHIVED): an import never revives an archived record, and
// never creates an active twin of one.

type Keyed = 'department' | 'position' | 'provider' | 'room' | 'course' | 'employee'
type KeyField = 'name' | 'code' | 'externalId' | 'email'

/**
 * Which values only archived records hold. Names compare folded (case and accents), as the
 * importer and `upsertNames` match them; codes, IDs and emails exactly.
 */
async function archivedOnly(
  tx: Tx,
  model: Keyed | 'courseSession' | 'courseCompletion',
  field: KeyField,
  values: Iterable<string | null>
): Promise<(value: string) => boolean> {
  const wanted = [...new Set([...values].filter((v): v is string => v !== null))]
  if (wanted.length === 0) return () => false
  const delegate = tx[model] as unknown as {
    findMany(args: object): Promise<Record<string, unknown>[]>
  }
  const key = field === 'name' ? (v: unknown) => fold(String(v)) : (v: unknown) => v
  const rows = await delegate.findMany({
    ...(field !== 'name' && { where: { [field]: { in: wanted } } }),
    select: { [field]: true, archivedAt: true },
  })
  const active = new Set(rows.filter(r => r['archivedAt'] === null).map(r => key(r[field])))
  const archived = new Set(
    rows
      .filter(r => r['archivedAt'] !== null)
      .map(r => key(r[field]))
      .filter(k => !active.has(k))
  )
  return value => archived.has(key(value))
}

/** Splits off the records that touch something archived. */
function withoutArchived<T>(
  records: T[],
  checks: [(value: string) => boolean, (r: T) => (string | null)[]][]
): { kept: T[]; skipped: number } {
  const kept = records.filter(
    r => !checks.some(([isArchived, keys]) => keys(r).some(k => k !== null && isArchived(k)))
  )
  return { kept, skipped: records.length - kept.length }
}

/**
 * The server never trusts records coming back from the browser: every record is re-parsed
 * with the domain schema and its free text re-sanitised before anything is written.
 */
const notReserved = (
  prefix: string
): [(r: { externalId: string }) => boolean, { path: PropertyKey[]; message: string }] => [
  r => !r.externalId.startsWith(prefix),
  { path: ['externalId'], message: 'RESERVED_ID' },
]

/**
 * IDs with the prefix the app gives what it creates (S…, A…, N…) are refused here as the
 * browser's importer refuses them: an import must never overwrite a record made in the app.
 */
const SCHEMAS = {
  rooms: roomSchema,
  courses: courseSchema,
  employees: employeeSchema.refine(...notReserved(APP_ID_PREFIX.employee)),
  sessions: sessionSchema.refine(...notReserved(APP_ID_PREFIX.session)),
  completions: completionSchema.refine(...notReserved(APP_ID_PREFIX.completion)),
} satisfies Record<DatasetKind, z.ZodType>

export class CommitValidationError extends Error {
  override name = 'CommitValidationError'
  constructor(
    readonly index: number,
    readonly issues: z.core.$ZodIssue[]
  ) {
    super(`Record ${index} failed validation`)
  }
}

/**
 * Why a valid record still cannot be written: it would take a room an app-planned session
 * holds then (`ROOM_BUSY`), or leave upcoming sessions in a room that no longer suits them
 * (`ROOM_UNFIT`), as the room and session forms refuse.
 */
export type CommitRefusal = 'ROOM_BUSY' | 'ROOM_UNFIT'

export class CommitRefusedError extends Error {
  override name = 'CommitRefusedError'
  constructor(
    readonly index: number,
    readonly reason: CommitRefusal,
    /** The record's key, and what it clashes with where there is one ("T012 → S004"). */
    readonly key: string
  ) {
    super(`Record ${index} (${key}) refused: ${reason}`)
  }
}

export function revalidate<K extends DatasetKind>(kind: K, records: unknown[]): DatasetRecord[K][] {
  const schema = SCHEMAS[kind] as unknown as z.ZodType<DatasetRecord[K]>
  return records.map((record, index) => {
    const parsed = schema.safeParse(record)
    if (!parsed.success) throw new CommitValidationError(index, parsed.error.issues)
    return parsed.data
  })
}

/**
 * The id of each name's active record, created where there is none. Names match folded (case
 * and accents: "Personalni oddeleni" is "Personální oddělení"), so a spelling variant never
 * makes a twin; a new record keeps the first spelling met. Creating takes a lock per table,
 * so two imports cannot both create the same name.
 */
async function upsertNames(
  tx: Tx,
  model: 'department' | 'position' | 'provider',
  names: Iterable<string>
): Promise<Map<string, string>> {
  const unique = [...new Set(names)]
  if (unique.length === 0) return new Map()
  const delegate = tx[model] as unknown as {
    create(args: { data: { name: string }; select: { id: true } }): Promise<{ id: string }>
    findMany(args: {
      where: { archivedAt: null }
      select: { id: true; name: true }
    }): Promise<{ id: string; name: string }[]>
  }
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`names:${model}`}))`
  const rows = await delegate.findMany({ where: ACTIVE, select: { id: true, name: true } })
  const byKey = new Map(rows.map(r => [fold(r.name), r.id]))
  const ids = new Map<string, string>()
  for (const name of unique) {
    let id = byKey.get(fold(name))
    if (id === undefined) {
      id = (await delegate.create({ data: { name }, select: { id: true } })).id
      byKey.set(fold(name), id)
    }
    ids.set(name, id)
  }
  return ids
}

/** Splits records into new and existing by external key, then writes each set. */
async function partition<T>(
  records: T[],
  keyOf: (r: T) => string,
  findExisting: (keys: string[]) => Promise<{ key: string; id: string }[]>
): Promise<{ fresh: T[]; existing: { record: T; id: string }[] }> {
  const found = new Map((await findExisting(records.map(keyOf))).map(e => [e.key, e.id]))
  const fresh: T[] = []
  const existing: { record: T; id: string }[] = []
  for (const record of records) {
    const id = found.get(keyOf(record))
    if (id) existing.push({ record, id })
    else fresh.push(record)
  }
  return { fresh, existing }
}

async function writeRooms(tx: Tx, all: RoomInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'room',
        'name',
        all.map(r => r.name)
      ),
      r => [r.name],
    ],
  ])
  // Room and session writes take turns (see lockSessions): sessions planned meanwhile count.
  await lockSessions(tx)
  let created = 0
  let updated = 0
  for (const record of records) {
    const data = {
      kind: record.kind,
      capacity: record.capacity,
      note: cleanFreeText(record.note),
    }
    const existing = await tx.room.findFirst({
      where: { name: record.name, ...ACTIVE },
      select: roomFactsSelect,
    })
    if (existing) {
      const before = roomFactsOf(existing)
      const unfit = await newlyUnfit(tx, {
        roomId: existing.id,
        room: { ...before, ...data, capabilities: record.capabilities ?? before.capabilities },
      })
      if (unfit.length > 0)
        throw new CommitRefusedError(all.indexOf(record), 'ROOM_UNFIT', record.name)
    }
    const room = existing
      ? await tx.room.update({ where: { id: existing.id }, data, select: { id: true } })
      : await tx.room.create({ data: { name: record.name, ...data }, select: { id: true } })
    if (existing) updated++
    else created++
    if (record.capabilities === null) continue
    await tx.roomCapability.deleteMany({ where: { roomId: room.id } })
    await tx.roomCapability.createMany({
      data: record.capabilities.map(capability => ({ roomId: room.id, capability })),
      skipDuplicates: true,
    })
  }
  return { created, updated, skipped }
}

const departmentsOf = (r: CourseInput) =>
  r.requirements.flatMap(q => (q.scope === 'DEPARTMENT' ? [q.department] : []))
const positionsOf = (r: CourseInput) =>
  r.requirements.flatMap(q => (q.scope === 'POSITION' ? [q.position] : []))

async function writeCourses(tx: Tx, all: CourseInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'course',
        'code',
        all.map(r => r.code)
      ),
      r => [r.code],
    ],
    [await archivedOnly(tx, 'department', 'name', all.flatMap(departmentsOf)), departmentsOf],
    [await archivedOnly(tx, 'position', 'name', all.flatMap(positionsOf)), positionsOf],
  ])
  const departments = await upsertNames(
    tx,
    'department',
    records.flatMap(r =>
      r.requirements.flatMap(q => (q.scope === 'DEPARTMENT' ? [q.department] : []))
    )
  )
  const positions = await upsertNames(
    tx,
    'position',
    records.flatMap(r => r.requirements.flatMap(q => (q.scope === 'POSITION' ? [q.position] : [])))
  )
  let created = 0
  let updated = 0
  for (const record of records) {
    const existing = await tx.course.findFirst({
      where: { code: record.code, ...ACTIVE },
      select: { id: true },
    })
    // The catalog says who must hold the course; what a session needs is set in the app
    // (or derived from sessions) and never touched by an import.
    const audience = {
      name: record.name,
      validityMonths: record.validityMonths,
      requiredForAll: record.requirements.some(q => q.scope === 'ALL'),
    }
    const course = existing
      ? await tx.course.update({ where: { id: existing.id }, data: audience, select: { id: true } })
      : await tx.course.create({ data: { code: record.code, ...audience }, select: { id: true } })
    if (existing) updated++
    else created++
    await tx.courseDepartmentRequirement.deleteMany({ where: { courseId: course.id } })
    await tx.courseDepartmentRequirement.createMany({
      data: record.requirements.flatMap(q =>
        q.scope === 'DEPARTMENT'
          ? [{ courseId: course.id, departmentId: lookup(departments, q.department, 'department') }]
          : []
      ),
      skipDuplicates: true,
    })
    await tx.coursePositionRequirement.deleteMany({ where: { courseId: course.id } })
    await tx.coursePositionRequirement.createMany({
      data: record.requirements.flatMap(q =>
        q.scope === 'POSITION'
          ? [{ courseId: course.id, positionId: lookup(positions, q.position, 'position') }]
          : []
      ),
      skipDuplicates: true,
    })
  }
  return { created, updated, skipped }
}

/** Employee records that touch nothing archived (shared by both employee passes). */
async function activeEmployeeRecords(tx: Tx, all: EmployeeInput[]) {
  return withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'employee',
        'externalId',
        all.map(r => r.externalId)
      ),
      r => [r.externalId],
    ],
    [
      await archivedOnly(
        tx,
        'employee',
        'email',
        all.map(r => r.managerEmail)
      ),
      r => [r.managerEmail],
    ],
    [
      await archivedOnly(
        tx,
        'department',
        'name',
        all.map(r => r.department)
      ),
      r => [r.department],
    ],
    [
      await archivedOnly(
        tx,
        'position',
        'name',
        all.map(r => r.position)
      ),
      r => [r.position],
    ],
  ])
}

async function writeEmployees(tx: Tx, records: EmployeeInput[]): Promise<CommitResult> {
  const departments = await upsertNames(
    tx,
    'department',
    records.flatMap(r => (r.department ? [r.department] : []))
  )
  const positions = await upsertNames(
    tx,
    'position',
    records.flatMap(r => (r.position ? [r.position] : []))
  )
  const departmentOf = (r: EmployeeInput) =>
    r.department ? (departments.get(r.department) ?? null) : null
  const positionOf = (r: EmployeeInput) => (r.position ? (positions.get(r.position) ?? null) : null)
  // A pair the file holds is a pair the department has: the position exists in it.
  await tx.departmentPosition.createMany({
    data: records.flatMap(r => {
      const departmentId = departmentOf(r)
      const positionId = positionOf(r)
      return departmentId && positionId ? [{ departmentId, positionId }] : []
    }),
    skipDuplicates: true,
  })
  const toData = (r: EmployeeInput) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    nationalId: r.nationalId,
    departmentId: departmentOf(r),
    positionId: positionOf(r),
    hiredOn: isoDateToUtc(r.hiredOn),
    leftOn: r.leftOn ? isoDateToUtc(r.leftOn) : null,
    status: r.status,
    note: cleanFreeText(r.note),
  })

  const { fresh, existing } = await partition(
    records,
    r => r.externalId,
    async keys =>
      (
        await tx.employee.findMany({
          where: { externalId: { in: keys }, ...ACTIVE },
          select: { id: true, externalId: true },
        })
      ).map(e => ({ key: e.externalId, id: e.id }))
  )
  await tx.employee.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  const departmentNow = new Map(
    (
      await tx.employee.findMany({
        where: { id: { in: existing.map(e => e.id) } },
        select: { id: true, departmentId: true },
      })
    ).map(e => [e.id, e.departmentId])
  )
  for (const { record, id } of existing) {
    const data = toData(record)
    // Moved to another department: they no longer lead the one they left.
    const moved = departmentNow.get(id) !== data.departmentId
    await tx.employee.update({
      where: { id },
      data: { ...data, ...(moved && { leadsDepartment: false }) },
    })
  }
  return { created: fresh.length, updated: existing.length, skipped: 0 }
}

/**
 * Second pass: managers are referenced by email and may appear later in the file. A link that
 * would make someone their own manager, directly or round a loop through the register, is
 * left out (the review warned: MANAGER_CYCLE).
 */
async function linkManagers(tx: Tx, records: EmployeeInput[]): Promise<void> {
  // As the employee form does: manager links change one writer at a time.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employees_managers'))`
  const people = await tx.employee.findMany({
    where: ACTIVE,
    select: { id: true, externalId: true, email: true, managerId: true },
  })
  const idByEmail = new Map(people.flatMap(p => (p.email ? [[p.email, p.id] as const] : [])))
  const idByExternal = new Map(people.map(p => [p.externalId, p.id]))
  const links = new Map(people.map(p => [p.id, p.managerId]))
  const loops = (self: string, managerId: string) => {
    const seen = new Set<string>()
    for (let up: string | null = managerId; up && !seen.has(up); up = links.get(up) ?? null) {
      if (up === self) return true
      seen.add(up)
    }
    return false
  }
  const byManager = new Map<string | null, string[]>()
  for (const record of records) {
    const self = idByExternal.get(record.externalId)
    let managerId = record.managerEmail ? (idByEmail.get(record.managerEmail) ?? null) : null
    if (self && managerId && loops(self, managerId)) managerId = null
    if (self) links.set(self, managerId)
    const list = byManager.get(managerId) ?? []
    list.push(record.externalId)
    byManager.set(managerId, list)
  }
  for (const [managerId, externalIds] of byManager) {
    await tx.employee.updateMany({
      where: { externalId: { in: externalIds }, ...ACTIVE },
      data: { managerId },
    })
  }
}

async function courseIds(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const rows = await tx.course.findMany({
    where: { code: { in: [...new Set(codes)] }, ...ACTIVE },
    select: { id: true, code: true },
  })
  return new Map(rows.map(c => [c.code, c.id]))
}

function lookup<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Unknown ${what} "${key}"`)
  return value
}

/**
 * The room of each session, by name. A place no rooms file listed becomes a room of the kind
 * its name implies (see roomKindOfName), seating the largest session held there in this
 * chunk; an online room has no seat limit.
 */
async function resolveRooms(tx: Tx, records: SessionInput[]): Promise<Map<string, string>> {
  const names = [...new Set(records.map(r => r.location))]
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('names:room'))`
  const existing = await tx.room.findMany({ where: ACTIVE, select: { id: true, name: true } })
  const byKey = new Map(existing.map(r => [fold(r.name), r.id]))
  const ids = new Map<string, string>()
  for (const name of names) {
    const known = byKey.get(fold(name))
    if (known !== undefined) {
      ids.set(name, known)
      continue
    }
    const kind = roomKindOfName(name)
    const held = records.filter(r => fold(r.location) === fold(name))
    const room = await tx.room.create({
      data: {
        name,
        kind,
        capacity: kind === 'ONLINE' ? null : Math.max(1, ...held.map(r => r.capacity)),
      },
      select: { id: true },
    })
    byKey.set(fold(name), room.id)
    ids.set(name, room.id)
  }
  return ids
}

/**
 * Derives what a session of each course needs from all its planned sessions so far: the
 * usual length, the median group size, online if ever held online. Every sessions import
 * derives them again, so they follow the history; what the app set is kept apart as
 * overrides (which win) and is never touched here.
 */
async function deriveSessionNeeds(tx: Tx, courseIdList: string[]): Promise<void> {
  const courses = await tx.course.findMany({
    where: { id: { in: courseIdList } },
    select: {
      id: true,
      sessions: {
        where: { ...ACTIVE, status: 'PLANNED', capacity: { gt: 0 } },
        select: { startsAt: true, endsAt: true, capacity: true, room: { select: { kind: true } } },
      },
    },
  })
  for (const course of courses) {
    if (course.sessions.length === 0) continue
    const minutes = course.sessions.map(s =>
      Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000)
    )
    const sizes = course.sessions.map(s => s.capacity).sort((a, b) => a - b)
    await tx.course.update({
      where: { id: course.id },
      data: {
        sessionMinutes: mostCommon(minutes),
        groupSize: sizes[Math.floor((sizes.length - 1) / 2)] ?? null,
        onlineAllowed: course.sessions.some(s => s.room.kind === 'ONLINE'),
      },
    })
  }
}

/** The most frequent value; the smallest one on a tie. */
function mostCommon(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0
}

/**
 * Refuses a planned session in a room that a session planned in the app (an S… ID) holds at
 * the same time. Clashes between imported sessions are the source system's to keep.
 */
async function refuseAppRoomClashes(
  tx: Tx,
  all: SessionInput[],
  records: SessionInput[],
  rooms: Map<string, string>
): Promise<void> {
  const planned = records.filter(r => r.status === 'PLANNED')
  if (planned.length === 0) return
  const held = await tx.courseSession.findMany({
    where: {
      ...ACTIVE,
      status: 'PLANNED',
      externalId: { startsWith: APP_ID_PREFIX.session },
      roomId: { in: [...new Set(planned.map(r => lookup(rooms, r.location, 'room')))] },
      room: { kind: { not: 'ONLINE' } },
    },
    select: { externalId: true, roomId: true, startsAt: true, endsAt: true },
  })
  for (const record of planned) {
    const roomId = lookup(rooms, record.location, 'room')
    const startsAt = zonedTimeToUtc(record.date, record.startTime)
    const endsAt = zonedTimeToUtc(record.date, record.endTime)
    const clash = held.find(s => s.roomId === roomId && s.startsAt < endsAt && s.endsAt > startsAt)
    if (clash)
      throw new CommitRefusedError(
        all.indexOf(record),
        'ROOM_BUSY',
        `${record.externalId} → ${clash.externalId}`
      )
  }
}

async function writeSessions(tx: Tx, all: SessionInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'courseSession',
        'externalId',
        all.map(r => r.externalId)
      ),
      r => [r.externalId],
    ],
    [
      await archivedOnly(
        tx,
        'course',
        'code',
        all.map(r => r.courseCode)
      ),
      r => [r.courseCode],
    ],
    [
      await archivedOnly(
        tx,
        'room',
        'name',
        all.map(r => r.location)
      ),
      r => [r.location],
    ],
  ])
  // Session writes take turns, as the app's own do (see lockSessions).
  await lockSessions(tx)
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const rooms = await resolveRooms(tx, records)
  await refuseAppRoomClashes(tx, all, records, rooms)
  // The export's booked count is the session's total. Named bookings (assignments) are part of
  // it, so only the remainder is stored as unnamed seats; a total below the named count keeps
  // the named bookings and stores no unnamed ones.
  const toData = (r: SessionInput, assigned: number) => ({
    courseId: lookup(courses, r.courseCode, 'course'),
    startsAt: zonedTimeToUtc(r.date, r.startTime),
    endsAt: zonedTimeToUtc(r.date, r.endTime),
    roomId: lookup(rooms, r.location, 'room'),
    capacity: r.capacity,
    unnamedBookings: Math.max(0, r.bookedCount - assigned),
    pricePerPerson: r.pricePerPerson,
    status: r.status,
  })
  const assignedBySession = new Map<string, number>()
  const { fresh, existing } = await partition(
    records,
    r => r.externalId,
    async keys => {
      // Locked before the named bookings are counted, as booking locks the session: one
      // booked meanwhile is counted, not stored again as an unnamed seat.
      const found = await tx.$queryRaw<{ id: string; external_id: string }[]>`
        SELECT id, external_id FROM course_sessions
        WHERE external_id = ANY(${keys}) AND archived_at IS NULL
        ORDER BY id FOR UPDATE`
      const counts = await tx.sessionAssignment.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: found.map(f => f.id) } },
        _count: { _all: true },
      })
      for (const c of counts) assignedBySession.set(c.sessionId, c._count._all)
      return found.map(f => ({ key: f.external_id, id: f.id }))
    }
  )
  await tx.courseSession.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r, 0) })),
  })
  for (const { record, id } of existing)
    await tx.courseSession.update({
      where: { id },
      data: toData(record, assignedBySession.get(id) ?? 0),
    })
  await deriveSessionNeeds(tx, [...courses.values()])
  return { created: fresh.length, updated: existing.length, skipped }
}

async function writeCompletions(tx: Tx, all: CompletionInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'courseCompletion',
        'externalId',
        all.map(r => r.externalId)
      ),
      r => [r.externalId],
    ],
    [
      await archivedOnly(
        tx,
        'employee',
        'externalId',
        all.map(r => r.employeeExternalId)
      ),
      r => [r.employeeExternalId],
    ],
    [
      await archivedOnly(
        tx,
        'course',
        'code',
        all.map(r => r.courseCode)
      ),
      r => [r.courseCode],
    ],
    [
      await archivedOnly(
        tx,
        'provider',
        'name',
        all.map(r => r.provider)
      ),
      r => [r.provider],
    ],
  ])
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const employees = new Map(
    (
      await tx.employee.findMany({
        where: {
          externalId: { in: [...new Set(records.map(r => r.employeeExternalId))] },
          ...ACTIVE,
        },
        select: { id: true, externalId: true },
      })
    ).map(e => [e.externalId, e.id])
  )
  const providers = await upsertNames(
    tx,
    'provider',
    records.flatMap(r => (r.provider ? [r.provider] : []))
  )
  const toData = (r: CompletionInput) => ({
    employeeId: lookup(employees, r.employeeExternalId, 'employee'),
    courseId: lookup(courses, r.courseCode, 'course'),
    completedOn: isoDateToUtc(r.completedOn),
    validUntil: r.validUntil ? isoDateToUtc(r.validUntil) : null,
    providerId: r.provider ? (providers.get(r.provider) ?? null) : null,
    price: r.price,
    note: cleanFreeText(r.note),
  })
  const { fresh, existing } = await partition(
    records,
    r => r.externalId,
    async keys =>
      (
        await tx.courseCompletion.findMany({
          where: { externalId: { in: keys }, ...ACTIVE },
          select: { id: true, externalId: true },
        })
      ).map(e => ({ key: e.externalId, id: e.id }))
  )
  await tx.courseCompletion.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  for (const { record, id } of existing)
    await tx.courseCompletion.update({ where: { id }, data: toData(record) })
  return { created: fresh.length, updated: existing.length, skipped }
}

/**
 * Writes one chunk of one dataset in a single transaction (upsert by source ID, so
 * re-importing the same file is idempotent). Callers send datasets in COMMIT_ORDER.
 * Employee chunks also re-link managers, which may live in an earlier chunk.
 */
export async function commitChunk(
  db: Db,
  kind: DatasetKind,
  untrusted: unknown[]
): Promise<CommitResult> {
  if (untrusted.length > COMMIT_CHUNK_SIZE) {
    throw new Error(`At most ${COMMIT_CHUNK_SIZE} records per chunk`)
  }
  const records = revalidate(kind, untrusted)
  return db.$transaction(async tx => {
    switch (kind) {
      case 'rooms':
        return writeRooms(tx, records as RoomInput[])
      case 'courses':
        return writeCourses(tx, records as CourseInput[])
      case 'employees': {
        const { kept, skipped } = await activeEmployeeRecords(tx, records as EmployeeInput[])
        const result = await writeEmployees(tx, kept)
        await linkManagers(tx, kept)
        return { ...result, skipped }
      }
      case 'sessions':
        return writeSessions(tx, records as SessionInput[])
      case 'completions':
        return writeCompletions(tx, records as CompletionInput[])
    }
  }, TX_OPTIONS)
}

export function chunk<T>(items: readonly T[], size = COMMIT_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
