import {
  completionSchema,
  courseSchema,
  employeeSchema,
  sessionSchema,
  type CompletionInput,
  type CourseInput,
  type EmployeeInput,
  type SessionInput,
} from '@muni/domain/schemas'
import type { DatasetKind, DatasetRecord } from '@muni/importer'
import { isoDateToUtc, zonedTimeToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'
import type * as z from 'zod'

import type { Db } from './client'
import type { Prisma } from './generated/prisma/client'

type Tx = Prisma.TransactionClient

export const COMMIT_CHUNK_SIZE = 500
const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 }

export interface CommitResult {
  created: number
  updated: number
}

/**
 * The server never trusts records coming back from the browser: every record is re-parsed
 * with the domain schema and its free text re-sanitised before anything is written.
 */
const SCHEMAS = {
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
    findMany(args: { where: { name: { in: string[] } } }): Promise<{ id: string; name: string }[]>
  }
  await delegate.createMany({ data: unique.map(name => ({ name })), skipDuplicates: true })
  const rows = await delegate.findMany({ where: { name: { in: unique } } })
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

async function writeCourses(tx: Tx, records: CourseInput[]): Promise<CommitResult> {
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
    const existing = await tx.course.findUnique({
      where: { code: record.code },
      select: { id: true },
    })
    const course = await tx.course.upsert({
      where: { code: record.code },
      create: { code: record.code, name: record.name, validityMonths: record.validityMonths },
      update: { name: record.name, validityMonths: record.validityMonths },
      select: { id: true },
    })
    if (existing) updated++
    else created++
    await tx.courseRequirement.deleteMany({ where: { courseId: course.id } })
    await tx.courseRequirement.createMany({
      data: record.requirements.map(q => ({
        courseId: course.id,
        scope: q.scope,
        departmentId: q.scope === 'DEPARTMENT' ? (departments.get(q.department) ?? null) : null,
        positionId: q.scope === 'POSITION' ? (positions.get(q.position) ?? null) : null,
      })),
    })
  }
  return { created, updated }
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
          where: { externalId: { in: keys } },
          select: { id: true, externalId: true },
        })
      ).map(e => ({ key: e.externalId, id: e.id }))
  )
  await tx.employee.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  for (const { record, id } of existing)
    await tx.employee.update({ where: { id }, data: toData(record) })
  return { created: fresh.length, updated: existing.length }
}

/** Second pass: managers are referenced by email and may appear later in the file. */
async function linkManagers(tx: Tx, records: EmployeeInput[]): Promise<void> {
  const emails = [...new Set(records.flatMap(r => (r.managerEmail ? [r.managerEmail] : [])))]
  const managers = await tx.employee.findMany({
    where: { email: { in: emails } },
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
      where: { externalId: { in: externalIds } },
      data: { managerId },
    })
  }
}

async function courseIds(tx: Tx, codes: string[]): Promise<Map<string, string>> {
  const rows = await tx.course.findMany({
    where: { code: { in: [...new Set(codes)] } },
    select: { id: true, code: true },
  })
  return new Map(rows.map(c => [c.code, c.id]))
}

function lookup<T>(map: Map<string, T>, key: string, what: string): T {
  const value = map.get(key)
  if (value === undefined) throw new Error(`Unknown ${what} "${key}"`)
  return value
}

async function writeSessions(tx: Tx, records: SessionInput[]): Promise<CommitResult> {
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  // The export's booked count is the session's total. Named bookings (assignments) are part of
  // it, so only the remainder is stored as unnamed seats; a total below the named count keeps
  // the named bookings and stores no unnamed ones.
  const toData = (r: SessionInput, assigned: number) => ({
    courseId: lookup(courses, r.courseCode, 'course'),
    startsAt: zonedTimeToUtc(r.date, r.startTime),
    endsAt: zonedTimeToUtc(r.date, r.endTime),
    location: r.location,
    isOnline: r.isOnline,
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
          where: { externalId: { in: keys } },
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
  return { created: fresh.length, updated: existing.length }
}

async function writeCompletions(tx: Tx, records: CompletionInput[]): Promise<CommitResult> {
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const employees = new Map(
    (
      await tx.employee.findMany({
        where: { externalId: { in: [...new Set(records.map(r => r.employeeExternalId))] } },
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
          where: { externalId: { in: keys } },
          select: { id: true, externalId: true },
        })
      ).map(e => ({ key: e.externalId, id: e.id }))
  )
  await tx.courseCompletion.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r) })),
  })
  for (const { record, id } of existing)
    await tx.courseCompletion.update({ where: { id }, data: toData(record) })
  return { created: fresh.length, updated: existing.length }
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
      case 'courses':
        return writeCourses(tx, records as CourseInput[])
      case 'employees': {
        const result = await writeEmployees(tx, records as EmployeeInput[])
        await linkManagers(tx, records as EmployeeInput[])
        return result
      }
      case 'sessions':
        return writeSessions(tx, records as SessionInput[])
      case 'completions':
        return writeCompletions(tx, records as CompletionInput[])
    }
    throw new Error(`Unknown dataset ${String(kind)}`)
  }, TX_OPTIONS)
}

export function chunk<T>(items: readonly T[], size = COMMIT_CHUNK_SIZE): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
