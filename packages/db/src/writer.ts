import { roomKindOfName } from '@muni/domain/rooms'
import {
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
import { cleanFreeText } from '@muni/utils/text'
import type * as z from 'zod'

import type { Db, Tx } from './client'
import { ACTIVE } from './repositories/archive'

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

/** The values that only archived records hold. */
async function archivedOnly(
  tx: Tx,
  model: Keyed | 'courseSession' | 'courseCompletion',
  field: KeyField,
  values: Iterable<string | null>
): Promise<Set<string>> {
  const wanted = [...new Set([...values].filter((v): v is string => v !== null))]
  if (wanted.length === 0) return new Set()
  const delegate = tx[model] as unknown as {
    findMany(args: object): Promise<Record<string, unknown>[]>
  }
  const rows = await delegate.findMany({
    where: { [field]: { in: wanted } },
    select: { [field]: true, archivedAt: true },
  })
  const active = new Set(rows.filter(r => r['archivedAt'] === null).map(r => r[field]))
  return new Set(
    rows.filter(r => r['archivedAt'] !== null && !active.has(r[field])).map(r => r[field] as string)
  )
}

/** Splits off the records that touch something archived. */
function withoutArchived<T>(
  records: T[],
  checks: [Set<string>, (r: T) => (string | null)[]][]
): { kept: T[]; skipped: number } {
  const kept = records.filter(
    r => !checks.some(([set, keys]) => keys(r).some(k => k !== null && set.has(k)))
  )
  return { kept, skipped: records.length - kept.length }
}

/**
 * The server never trusts records coming back from the browser: every record is re-parsed
 * with the domain schema and its free text re-sanitised before anything is written.
 */
const SCHEMAS = {
  rooms: roomSchema,
  courses: courseSchema,
  employees: employeeSchema,
  sessions: sessionSchema,
  completions: completionSchema,
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

export function revalidate<K extends DatasetKind>(kind: K, records: unknown[]): DatasetRecord[K][] {
  const schema = SCHEMAS[kind] as unknown as z.ZodType<DatasetRecord[K]>
  return records.map((record, index) => {
    const parsed = schema.safeParse(record)
    if (!parsed.success) throw new CommitValidationError(index, parsed.error.issues)
    return parsed.data
  })
}

async function upsertNames(
  tx: Tx,
  model: 'department' | 'position' | 'provider',
  names: Iterable<string>
): Promise<Map<string, string>> {
  const unique = [...new Set(names)]
  if (unique.length === 0) return new Map()
  const delegate = tx[model] as unknown as {
    createMany(args: { data: { name: string }[]; skipDuplicates: boolean }): Promise<unknown>
    findMany(args: {
      where: { name: { in: string[] }; archivedAt: null }
    }): Promise<{ id: string; name: string }[]>
  }
  // ON CONFLICT DO NOTHING (no target) respects the partial unique index on active names.
  await delegate.createMany({ data: unique.map(name => ({ name })), skipDuplicates: true })
  const rows = await delegate.findMany({ where: { name: { in: unique }, ...ACTIVE } })
  return new Map(rows.map(r => [r.name, r.id]))
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
      select: { id: true },
    })
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
  const toData = (r: EmployeeInput) => ({
    firstName: r.firstName,
    lastName: r.lastName,
    email: r.email,
    nationalId: r.nationalId,
    departmentId: r.department ? (departments.get(r.department) ?? null) : null,
    positionId: r.position ? (positions.get(r.position) ?? null) : null,
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
  for (const { record, id } of existing)
    await tx.employee.update({ where: { id }, data: toData(record) })
  return { created: fresh.length, updated: existing.length, skipped: 0 }
}

/** Second pass: managers are referenced by email and may appear later in the file. */
async function linkManagers(tx: Tx, records: EmployeeInput[]): Promise<void> {
  const emails = [...new Set(records.flatMap(r => (r.managerEmail ? [r.managerEmail] : [])))]
  const managers = await tx.employee.findMany({
    where: { email: { in: emails }, ...ACTIVE },
    select: { id: true, email: true },
  })
  const idByEmail = new Map(managers.map(m => [m.email, m.id]))
  const byManager = new Map<string | null, string[]>()
  for (const record of records) {
    const managerId = record.managerEmail ? (idByEmail.get(record.managerEmail) ?? null) : null
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
  const existing = await tx.room.findMany({
    where: { name: { in: names }, ...ACTIVE },
    select: { id: true, name: true },
  })
  const ids = new Map(existing.map(r => [r.name, r.id]))
  for (const name of names) {
    if (ids.has(name)) continue
    const kind = roomKindOfName(name)
    const held = records.filter(r => r.location === name)
    const room = await tx.room.create({
      data: {
        name,
        kind,
        capacity: kind === 'ONLINE' ? null : Math.max(1, ...held.map(r => r.capacity)),
      },
      select: { id: true },
    })
    ids.set(name, room.id)
  }
  return ids
}

/**
 * Derives what a session of each course needs from all its planned sessions so far: the
 * usual length, the median group size, online if ever held online. Every sessions import
 * derives them again, so they follow the history; a course whose needs were set in the
 * app (needsManual) is left alone.
 */
async function deriveSessionNeeds(tx: Tx, courseIdList: string[]): Promise<void> {
  const courses = await tx.course.findMany({
    where: { id: { in: courseIdList }, needsManual: false },
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
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const rooms = await resolveRooms(tx, records)
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
    async keys =>
      (
        await tx.courseSession.findMany({
          where: { externalId: { in: keys }, ...ACTIVE },
          select: { id: true, externalId: true, _count: { select: { assignments: true } } },
        })
      ).map(e => {
        assignedBySession.set(e.id, e._count.assignments)
        return { key: e.externalId, id: e.id }
      })
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
