import {
  APP_ID_PREFIX,
  type CompletionCreate,
  completionCreateSchema,
  type CourseCreate,
  courseCreateSchema,
  type CourseEdit,
  courseEditSchema,
  type EmployeeEdit,
  employeeEditSchema,
} from '@muni/domain/schemas'
import { isoDateFromUtc, isoDateToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from './archive'
import { dbOf, type RepoOptions, toAmount } from './context'

// Creating and editing courses, people and completions. Callers (server actions) have
// checked for an admin; the input is parsed again here whatever they checked. Everything a
// record points to (a department, a manager, a course) must be active, and is read under a
// share lock, so it cannot be archived while the write is in flight.

/** Why a write was refused, by the field to change. */
export type RecordProblem =
  | { field: 'code' | 'email'; reason: 'taken' }
  | {
      field: 'departmentIds' | 'positionIds' | 'departmentId' | 'positionId' | 'managerExternalId'
      reason: 'not_found'
    }
  | { field: 'managerExternalId'; reason: 'manager_cycle' }

export type RecordWrite<T> = ({ ok: true } & T) | ({ ok: false } & RecordProblem)

const isUnique = (error: unknown) => (error as { code?: unknown } | null)?.code === 'P2002'

/** The ids among `ids` that name active rows of the table, locked against archiving. */
async function activeIds(tx: Tx, table: 'departments' | 'positions', ids: string[]) {
  if (ids.length === 0) return new Set<string>()
  // The table name comes from the closed union above, never from the caller.
  const rows = await tx.$queryRawUnsafe<{ id: string }[]>(
    `SELECT id FROM ${table} WHERE id = ANY($1) AND archived_at IS NULL FOR SHARE`,
    ids
  )
  return new Set(rows.map(r => r.id))
}

/** Who must hold the course, replaced as a whole. False when a department or position is gone. */
async function writeAudience(
  tx: Tx,
  courseId: string,
  data: Pick<CourseEdit, 'departmentIds' | 'positionIds'>
): Promise<RecordProblem | null> {
  const departments = await activeIds(tx, 'departments', data.departmentIds)
  if (departments.size !== data.departmentIds.length)
    return { field: 'departmentIds', reason: 'not_found' }
  const positions = await activeIds(tx, 'positions', data.positionIds)
  if (positions.size !== data.positionIds.length)
    return { field: 'positionIds', reason: 'not_found' }
  await tx.courseDepartmentRequirement.deleteMany({ where: { courseId } })
  await tx.courseDepartmentRequirement.createMany({
    data: data.departmentIds.map(departmentId => ({ courseId, departmentId })),
  })
  await tx.coursePositionRequirement.deleteMany({ where: { courseId } })
  await tx.coursePositionRequirement.createMany({
    data: data.positionIds.map(positionId => ({ courseId, positionId })),
  })
  return null
}

const courseFields = (data: CourseEdit) => ({
  name: data.name,
  validityMonths: data.validityMonths,
  requiredForAll: data.requiredForAll,
  sessionMinutes: data.sessionMinutes,
  groupSize: data.groupSize,
  onlineAllowed: data.onlineAllowed,
  // Set by hand: imports stop deriving the needs from the sessions.
  needsManual: true,
})

async function writeCapabilities(tx: Tx, courseId: string, data: CourseEdit) {
  await tx.courseCapability.deleteMany({ where: { courseId } })
  await tx.courseCapability.createMany({
    data: data.capabilities.map(capability => ({ courseId, capability })),
    skipDuplicates: true,
  })
}

/** Thrown inside a transaction to roll it back with a problem to report. */
class Refused extends Error {
  constructor(readonly problem: RecordProblem) {
    super(problem.reason)
  }
}

async function refusable<T>(run: () => Promise<T>): Promise<T | ({ ok: false } & RecordProblem)> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof Refused) return { ok: false, ...error.problem }
    throw error
  }
}

/** A new course. Its code must not be taken by an active course. */
export async function createCourse(
  input: CourseCreate,
  options?: RepoOptions
): Promise<RecordWrite<{ code: string }>> {
  const data = courseCreateSchema.parse(input)
  try {
    return await refusable(() =>
      dbOf(options).$transaction(async tx => {
        const course = await tx.course.create({
          data: { code: data.code, ...courseFields(data) },
          select: { id: true, code: true },
        })
        const problem = await writeAudience(tx, course.id, data)
        if (problem) throw new Refused(problem)
        await writeCapabilities(tx, course.id, data)
        return { ok: true as const, code: course.code }
      })
    )
  } catch (error) {
    if (isUnique(error)) return { ok: false, field: 'code', reason: 'taken' }
    throw error
  }
}

/**
 * Saves a course: its name, validity, who must hold it and what a session needs. An unknown or
 * archived code throws P2025. (A courses import replaces who must hold it again.)
 */
export async function updateCourse(
  code: string,
  input: CourseEdit,
  options?: RepoOptions
): Promise<RecordWrite<{ code: string }>> {
  const data = courseEditSchema.parse(input)
  return refusable(() =>
    dbOf(options).$transaction(async tx => {
      const course = await tx.course.update({
        where: { code, ...ACTIVE },
        data: courseFields(data),
        select: { id: true, code: true },
      })
      const problem = await writeAudience(tx, course.id, data)
      if (problem) throw new Refused(problem)
      await writeCapabilities(tx, course.id, data)
      return { ok: true as const, code: course.code }
    })
  )
}

/**
 * Checks what a person points to: the department and position are active, the manager is an
 * active person other than them and not someone who (indirectly) reports to them.
 */
async function personLinks(
  tx: Tx,
  data: EmployeeEdit,
  self: string | null
): Promise<{ departmentId: string | null; positionId: string | null; managerId: string | null }> {
  if (data.departmentId && !(await activeIds(tx, 'departments', [data.departmentId])).size)
    throw new Refused({ field: 'departmentId', reason: 'not_found' })
  if (data.positionId && !(await activeIds(tx, 'positions', [data.positionId])).size)
    throw new Refused({ field: 'positionId', reason: 'not_found' })
  let managerId: string | null = null
  if (data.managerExternalId) {
    const [manager] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM employees
       WHERE external_id = ${data.managerExternalId} AND archived_at IS NULL
       FOR SHARE`
    if (!manager) throw new Refused({ field: 'managerExternalId', reason: 'not_found' })
    // Up the manager's chain: reaching this person would make a loop.
    const seen = new Set<string>()
    for (let up: string | null = manager.id; up && !seen.has(up);) {
      if (up === self) throw new Refused({ field: 'managerExternalId', reason: 'manager_cycle' })
      seen.add(up)
      up =
        (await tx.employee.findUnique({ where: { id: up }, select: { managerId: true } }))
          ?.managerId ?? null
    }
    managerId = manager.id
  }
  return { departmentId: data.departmentId, positionId: data.positionId, managerId }
}

const personFields = (data: EmployeeEdit) => ({
  firstName: data.firstName,
  lastName: data.lastName,
  email: data.email,
  nationalId: data.nationalId,
  hiredOn: isoDateToUtc(data.hiredOn),
  leftOn: data.leftOn ? isoDateToUtc(data.leftOn) : null,
  status: data.status,
  note: cleanFreeText(data.note),
})

/**
 * A person entered in the app. Their ID takes the app's own prefix (N0001, N0002, …), which
 * imports refuse, so a later export can never overwrite them.
 */
export async function createEmployee(
  input: EmployeeEdit,
  options?: RepoOptions
): Promise<RecordWrite<{ externalId: string }>> {
  const data = employeeEditSchema.parse(input)
  try {
    return await refusable(() =>
      dbOf(options).$transaction(async tx => {
        // App IDs are handed out one at a time; archived people count, so none is reused.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employees_app_id'))`
        const links = await personLinks(tx, data, null)
        const ids = await tx.employee.findMany({
          // eslint-disable-next-line no-restricted-syntax -- archived ones count: an ID is never reused
          where: { externalId: { startsWith: APP_ID_PREFIX.employee } },
          select: { externalId: true },
        })
        const next = Math.max(0, ...ids.map(e => Number(e.externalId.slice(1)) || 0)) + 1
        const externalId = `${APP_ID_PREFIX.employee}${String(next).padStart(4, '0')}`
        await tx.employee.create({ data: { externalId, ...personFields(data), ...links } })
        return { ok: true as const, externalId }
      })
    )
  } catch (error) {
    if (isUnique(error)) return { ok: false, field: 'email', reason: 'taken' }
    throw error
  }
}

/** Saves a person. An unknown or archived ID throws P2025; a taken email is reported. */
export async function updateEmployee(
  externalId: string,
  input: EmployeeEdit,
  options?: RepoOptions
): Promise<RecordWrite<{ externalId: string }>> {
  const data = employeeEditSchema.parse(input)
  try {
    return await refusable(() =>
      dbOf(options).$transaction(async tx => {
        const current = await tx.employee.findFirstOrThrow({
          where: { externalId, ...ACTIVE },
          select: { id: true },
        })
        const links = await personLinks(tx, data, current.id)
        await tx.employee.update({
          where: { id: current.id },
          data: { ...personFields(data), ...links },
        })
        return { ok: true as const, externalId }
      })
    )
  } catch (error) {
    if (isUnique(error)) return { ok: false, field: 'email', reason: 'taken' }
    throw error
  }
}

/** An active provider's id by name, created when there is none. */
async function providerId(tx: Tx, name: string): Promise<string> {
  return (
    (await tx.provider.findFirst({ where: { name, ...ACTIVE }, select: { id: true } })) ??
    (await tx.provider.create({ data: { name }, select: { id: true } }))
  ).id
}

const completionFields = async (tx: Tx, data: CompletionCreate) => ({
  courseId: (
    await tx.course.findFirstOrThrow({
      where: { code: data.courseCode, ...ACTIVE },
      select: { id: true },
    })
  ).id,
  completedOn: isoDateToUtc(data.completedOn),
  validUntil: data.validUntil ? isoDateToUtc(data.validUntil) : null,
  providerId: data.provider ? await providerId(tx, data.provider) : null,
  price: data.price,
  note: cleanFreeText(data.note),
})

/** Records a completion entered in the app. Its ID gets an `A` prefix to keep clear of imports. */
export async function createCompletion(
  employeeExternalId: string,
  input: CompletionCreate,
  options?: RepoOptions
) {
  const data = completionCreateSchema.parse(input)
  return dbOf(options).$transaction(async tx => {
    const employee = await tx.employee.findFirstOrThrow({
      where: { externalId: employeeExternalId, ...ACTIVE },
      select: { id: true },
    })
    return tx.courseCompletion.create({
      data: {
        externalId:
          `${APP_ID_PREFIX.completion}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
        employeeId: employee.id,
        ...(await completionFields(tx, data)),
      },
      select: { externalId: true },
    })
  })
}

/**
 * Corrects a completion (its course, dates, provider, price, note). An unknown or archived
 * one throws P2025. One that came from an import is overwritten by the next import of it.
 */
export async function updateCompletion(id: string, input: CompletionCreate, options?: RepoOptions) {
  const data = completionCreateSchema.parse(input)
  return dbOf(options).$transaction(async tx =>
    tx.courseCompletion.update({
      where: { id, ...ACTIVE },
      data: await completionFields(tx, data),
      select: { externalId: true, employee: { select: { externalId: true } } },
    })
  )
}

/** A completion's values for its edit form (admins only), or null. */
export async function getCompletionForEdit(id: string, options?: RepoOptions) {
  const completion = await dbOf(options).courseCompletion.findFirst({
    where: { id, ...ACTIVE, employee: ACTIVE },
    select: {
      id: true,
      externalId: true,
      completedOn: true,
      validUntil: true,
      price: true,
      note: true,
      course: { select: { code: true } },
      provider: { select: { name: true } },
      employee: { select: { externalId: true, firstName: true, lastName: true } },
    },
  })
  return (
    completion && {
      id: completion.id,
      externalId: completion.externalId,
      /** Imported (not `A…`): the next import of the same file overwrites the changes. */
      imported: !completion.externalId.startsWith(APP_ID_PREFIX.completion),
      courseCode: completion.course.code,
      completedOn: isoDateFromUtc(completion.completedOn),
      validUntil: completion.validUntil ? isoDateFromUtc(completion.validUntil) : null,
      provider: completion.provider?.name ?? null,
      price: toAmount(completion.price),
      note: completion.note,
      employee: {
        externalId: completion.employee.externalId,
        name: `${completion.employee.lastName} ${completion.employee.firstName}`,
      },
    }
  )
}
