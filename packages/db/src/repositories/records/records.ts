import { sortName } from '@muni/domain/names'
import {
  APP_ID_PREFIX,
  type CompletionEdit,
  completionEditSchema,
  type CourseCreate,
  courseCreateSchema,
  type CourseEdit,
  courseEditSchema,
  type EmployeeEdit,
  employeeEditSchema,
} from '@muni/domain/schemas'
import { addMonths, isoDateFromUtc, isoDateToUtc } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../../client'
import { ACTIVE } from '../archive/archive'
import { dbOf, nowOf, type RepoOptions, toAmount } from '../core/context'
import { isPrismaCode } from '../core/errors'
import { lockSessionWrites, needsSelect, newlyUnfit } from '../scheduling/session-fit'

// Creating and editing courses, people and completions. Callers (server actions) have
// checked for an admin; the input is parsed again here whatever they checked. Everything a
// record points to (a department, a manager, a course) must be active, and is read under a
// share lock, so it cannot be archived while the write is in flight. Records are picked by
// their internal id, never matched by a name.

/** Why a write was refused, by the field to change. */
export type RecordProblem =
  | { field: 'code' | 'email' | 'newProviderName'; reason: 'taken' }
  | {
      field:
        | 'departmentIds'
        | 'positionIds'
        | 'departmentId'
        | 'positionId'
        | 'managerId'
        | 'employeeId'
        | 'courseId'
        | 'providerId'
      reason: 'not_found'
    }
  /** The department does not have the position. */
  | { field: 'positionId'; reason: 'pair_unknown' }
  | { field: 'managerId'; reason: 'manager_cycle' }
  /** Upcoming sessions of the course would no longer fit their rooms. */
  | { field: 'onlineAllowed' | 'capabilities'; reason: 'sessions_unfit'; count: number }

export type RecordWrite<T> = ({ ok: true } & T) | ({ ok: false } & RecordProblem)

const isUnique = (error: unknown) => isPrismaCode(error, 'P2002')

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

/** What the form sets: the course, who must hold it, and what its sessions are. */
const courseFields = (data: CourseEdit) => ({
  name: data.name,
  validityMonths: data.validityMonths,
  requiredForAll: data.requiredForAll,
  sessionMinutes: data.sessionMinutes,
  seats: data.seats,
  onlineAllowed: data.onlineAllowed,
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
 * archived code throws P2025. (A courses import replaces who must hold it again.) Refused when
 * upcoming sessions that fit their rooms would stop fitting (online no longer allowed, or
 * equipment their rooms lack).
 */
export async function updateCourse(
  code: string,
  input: CourseEdit,
  options?: RepoOptions
): Promise<RecordWrite<{ code: string }>> {
  const data = courseEditSchema.parse(input)
  return refusable(() =>
    dbOf(options).$transaction(async tx => {
      await lockSessionWrites(tx)
      const current = await tx.course.findFirstOrThrow({
        where: { code, ...ACTIVE },
        select: { id: true, ...needsSelect },
      })
      const unfit = await newlyUnfit(
        tx,
        {
          courseId: current.id,
          needs: {
            seats: data.seats,
            onlineAllowed: data.onlineAllowed,
            capabilities: data.capabilities,
          },
        },
        nowOf(options)
      )
      if (unfit.length > 0)
        throw new Refused({
          field: unfit.some(m => m.kind === 'ONLINE_NOT_ALLOWED')
            ? 'onlineAllowed'
            : 'capabilities',
          reason: 'sessions_unfit',
          count: unfit.length,
        })
      const course = await tx.course.update({
        where: { id: current.id },
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
 * Finds the active row and locks it for the rest of the transaction, as archiving does: an
 * edit never lands on a row archived meanwhile. A missing or archived row throws P2025, as
 * `findFirstOrThrow` does, which the actions report as not found.
 */
async function lockActive(
  tx: Tx,
  model: 'employee' | 'courseCompletion',
  where: { externalId: string } | { id: string }
): Promise<{ id: string }> {
  const delegate = tx[model] as unknown as {
    findFirstOrThrow(args: object): Promise<{ id: string }>
  }
  const found = await delegate.findFirstOrThrow({
    where: { ...where, ...ACTIVE },
    select: { id: true },
  })
  if (model === 'employee')
    await tx.$queryRaw`SELECT id FROM employees WHERE id = ${found.id} FOR UPDATE`
  else await tx.$queryRaw`SELECT id FROM course_completions WHERE id = ${found.id} FOR UPDATE`
  // Read again under the lock: archived while this waited is gone.
  return delegate.findFirstOrThrow({ where: { id: found.id, ...ACTIVE }, select: { id: true } })
}

/** Whether the department has the position (locked, so the pair cannot be dropped meanwhile). */
async function pairExists(tx: Tx, departmentId: string, positionId: string) {
  const rows = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM department_positions
     WHERE department_id = ${departmentId} AND position_id = ${positionId}
     FOR SHARE`
  return rows.length > 0
}

/**
 * Checks what a person points to: the department and position are active and the department
 * has the position; the manager is an active person other than them and not someone who
 * (indirectly) reports to them. Making them their department's head takes the role from
 * whoever had it, under the department's lock.
 */
async function personLinks(tx: Tx, data: EmployeeEdit, self: string | null) {
  if (data.departmentId && !(await activeIds(tx, 'departments', [data.departmentId])).size)
    throw new Refused({ field: 'departmentId', reason: 'not_found' })
  if (data.positionId && !(await activeIds(tx, 'positions', [data.positionId])).size)
    throw new Refused({ field: 'positionId', reason: 'not_found' })
  if (
    data.departmentId &&
    data.positionId &&
    !(await pairExists(tx, data.departmentId, data.positionId))
  )
    throw new Refused({ field: 'positionId', reason: 'pair_unknown' })
  if (data.managerId) {
    // Manager links change one at a time, so two edits cannot each pass the loop check below
    // and close a loop together (A under B while C goes under A, with B under C).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employees_managers'))`
    const [manager] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM employees WHERE id = ${data.managerId} AND archived_at IS NULL FOR SHARE`
    if (!manager) throw new Refused({ field: 'managerId', reason: 'not_found' })
    // Up the manager's chain: reaching this person would make a loop.
    const seen = new Set<string>()
    for (let up: string | null = manager.id; up && !seen.has(up);) {
      if (up === self) throw new Refused({ field: 'managerId', reason: 'manager_cycle' })
      seen.add(up)
      up =
        (await tx.employee.findUnique({ where: { id: up }, select: { managerId: true } }))
          ?.managerId ?? null
    }
  }
  if (data.leadsDepartment && data.departmentId) {
    await tx.$queryRaw`SELECT id FROM departments WHERE id = ${data.departmentId} FOR UPDATE`
    await tx.employee.updateMany({
      where: {
        departmentId: data.departmentId,
        leadsDepartment: true,
        ...(self && { id: { not: self } }),
      },
      data: { leadsDepartment: false },
    })
  }
  return {
    departmentId: data.departmentId,
    positionId: data.positionId,
    managerId: data.managerId,
    leadsDepartment: data.leadsDepartment,
  }
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
        const current = await lockActive(tx, 'employee', { externalId })
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

/**
 * The provider a completion names: the one picked (active, or the one it already had), or a
 * new one named on the form. A new name that an active provider already has, in any case or
 * accents, is refused so the user picks that one; nothing is matched silently.
 */
async function completionProvider(
  tx: Tx,
  data: CompletionEdit,
  current: string | null
): Promise<string | null> {
  if (data.providerId) {
    if (data.providerId === current) return current
    const [provider] = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM providers WHERE id = ${data.providerId} AND archived_at IS NULL FOR SHARE`
    if (!provider) throw new Refused({ field: 'providerId', reason: 'not_found' })
    return provider.id
  }
  if (!data.newProviderName) return null
  const wanted = fold(data.newProviderName)
  const active = await tx.provider.findMany({ where: ACTIVE, select: { name: true } })
  if (active.some(p => fold(p.name) === wanted))
    throw new Refused({ field: 'newProviderName', reason: 'taken' })
  return (await tx.provider.create({ data: { name: data.newProviderName }, select: { id: true } }))
    .id
}

/**
 * What a completion stores. The person and course are active (or, for the course, the one it
 * already had); an empty validity is worked out from the course, never taken from the client.
 */
async function completionFields(
  tx: Tx,
  data: CompletionEdit,
  current: { courseId: string; providerId: string | null } | null
) {
  const [employee] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM employees WHERE id = ${data.employeeId} AND archived_at IS NULL FOR SHARE`
  if (!employee) throw new Refused({ field: 'employeeId', reason: 'not_found' })
  const course = await tx.course.findFirst({
    where: {
      id: data.courseId,
      ...(data.courseId === current?.courseId ? {} : ACTIVE),
    },
    select: { id: true, validityMonths: true },
  })
  if (!course) throw new Refused({ field: 'courseId', reason: 'not_found' })
  const validUntil =
    data.validUntil ??
    (course.validityMonths === null ? null : addMonths(data.completedOn, course.validityMonths))
  return {
    employeeId: employee.id,
    courseId: course.id,
    completedOn: isoDateToUtc(data.completedOn),
    validUntil: validUntil ? isoDateToUtc(validUntil) : null,
    providerId: await completionProvider(tx, data, current?.providerId ?? null),
    price: data.price,
    note: cleanFreeText(data.note),
  }
}

type CompletionWrite = RecordWrite<{ employeeExternalId: string }>

async function writeCompletion(
  options: RepoOptions | undefined,
  run: (tx: Tx) => Promise<{ employeeId: string }>
): Promise<CompletionWrite> {
  try {
    return await refusable(() =>
      dbOf(options).$transaction(async tx => {
        const { employeeId } = await run(tx)
        const employee = await tx.employee.findUniqueOrThrow({
          where: { id: employeeId },
          select: { externalId: true },
        })
        return { ok: true as const, employeeExternalId: employee.externalId }
      })
    )
  } catch (error) {
    // Two forms adding the same new provider at once: the second one is told to pick it.
    if (isUnique(error)) return { ok: false, field: 'newProviderName', reason: 'taken' }
    throw error
  }
}

/** Records a completion entered in the app. Its ID gets an `A` prefix to keep clear of imports. */
export function createCompletion(input: CompletionEdit, options?: RepoOptions) {
  const data = completionEditSchema.parse(input)
  return writeCompletion(options, async tx =>
    tx.courseCompletion.create({
      data: {
        externalId:
          `${APP_ID_PREFIX.completion}${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`.toUpperCase(),
        ...(await completionFields(tx, data, null)),
      },
      select: { employeeId: true },
    })
  )
}

/**
 * Corrects a completion (its person, course, dates, provider, price, note). An unknown or
 * archived one throws P2025. One that came from an import is overwritten by the next import.
 */
export function updateCompletion(id: string, input: CompletionEdit, options?: RepoOptions) {
  const data = completionEditSchema.parse(input)
  return writeCompletion(options, async tx => {
    await lockActive(tx, 'courseCompletion', { id })
    const current = await tx.courseCompletion.findUniqueOrThrow({
      where: { id },
      select: { id: true, courseId: true, providerId: true },
    })
    return tx.courseCompletion.update({
      where: { id: current.id },
      data: await completionFields(tx, data, current),
      select: { employeeId: true },
    })
  })
}

/**
 * A completion's values for its edit form (admins only), or null. Its course and provider
 * come along even when archived, so the form keeps them (shown, not offered to others). A
 * validity that is just the course's is left empty: the form's empty means "from the course".
 */
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
      course: {
        select: { id: true, code: true, name: true, validityMonths: true, archivedAt: true },
      },
      provider: { select: { id: true, name: true, archivedAt: true } },
      employee: { select: { id: true, externalId: true, firstName: true, lastName: true } },
    },
  })
  if (!completion) return null
  const completedOn = isoDateFromUtc(completion.completedOn)
  const validUntil = completion.validUntil ? isoDateFromUtc(completion.validUntil) : null
  const months = completion.course.validityMonths
  const derived = months === null ? null : addMonths(completedOn, months)
  return {
    id: completion.id,
    externalId: completion.externalId,
    /** Imported (not `A…`): the next import of the same file overwrites the changes. */
    imported: !completion.externalId.startsWith(APP_ID_PREFIX.completion),
    employeeId: completion.employee.id,
    courseId: completion.course.id,
    course: {
      id: completion.course.id,
      code: completion.course.code,
      name: completion.course.name,
      validityMonths: completion.course.validityMonths,
      archived: completion.course.archivedAt !== null,
    },
    completedOn,
    validUntil: validUntil === derived ? null : validUntil,
    providerId: completion.provider?.id ?? null,
    provider: completion.provider && {
      id: completion.provider.id,
      name: completion.provider.name,
      archived: completion.provider.archivedAt !== null,
    },
    price: toAmount(completion.price),
    note: completion.note,
    employee: {
      id: completion.employee.id,
      externalId: completion.employee.externalId,
      name: sortName(completion.employee),
    },
  }
}
