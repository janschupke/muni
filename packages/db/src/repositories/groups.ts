import { sortName } from '@muni/domain/names'
import {
  type DepartmentInput,
  departmentSchema,
  type PositionInput,
  positionSchema,
} from '@muni/domain/schemas'

import type { Tx } from '../client'
import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'
import { stillEmployed } from './employment'
import { isPrismaCode } from './errors'
import { headOf } from './org'

// Departments and positions as records. A position exists in departments (the pairs), and a
// person's department and position must be one of those pairs. A department's head is a flag
// on one of its members. Imports create names and pairs they meet; the forms here set the
// rest. Archiving is in archiving.ts.

export type GroupKind = 'department' | 'position'

export type GroupProblem =
  | { field: 'name'; reason: 'taken' }
  | { field: 'headId'; reason: 'not_a_member' }
  /** Members hold the position in departments the form leaves out. */
  | { field: 'departmentIds'; reason: 'in_use'; count: number }
  | { field: 'departmentIds'; reason: 'not_found' }

export type GroupWrite = { ok: true; id: string } | ({ ok: false } & GroupProblem)

const isUnique = (error: unknown) => isPrismaCode(error, 'P2002')

class Refused extends Error {
  constructor(readonly problem: GroupProblem) {
    super(problem.reason)
  }
}

async function guarded(run: () => Promise<{ id: string }>): Promise<GroupWrite> {
  try {
    return { ok: true, ...(await run()) }
  } catch (error) {
    if (error instanceof Refused) return { ok: false, ...error.problem }
    if (isUnique(error)) return { ok: false, field: 'name', reason: 'taken' }
    throw error
  }
}

/**
 * Makes `headId` (or nobody) the department's head. The department row is locked so two
 * saves cannot each set a head; the head must be an active member who has not left.
 */
async function setHead(tx: Tx, departmentId: string, headId: string | null) {
  await tx.$queryRaw`SELECT id FROM departments WHERE id = ${departmentId} FOR UPDATE`
  if (headId) {
    // The person's row too, as archiving them takes it: an archived person never becomes head.
    await tx.$queryRaw`SELECT id FROM employees WHERE id = ${headId} FOR UPDATE`
    const head = await tx.employee.findFirst({
      where: { id: headId, departmentId, ...ACTIVE, ...stillEmployed() },
      select: { id: true },
    })
    if (!head) throw new Refused({ field: 'headId', reason: 'not_a_member' })
  }
  await tx.employee.updateMany({
    where: { departmentId, leadsDepartment: true, ...(headId && { id: { not: headId } }) },
    data: { leadsDepartment: false },
  })
  if (headId) await tx.employee.update({ where: { id: headId }, data: { leadsDepartment: true } })
}

/** A new department, or a renamed one with its head; its name must not be taken (any case). */
export function saveDepartment(
  id: string | null,
  input: DepartmentInput,
  options?: RepoOptions
): Promise<GroupWrite> {
  const { name, headId } = departmentSchema.parse(input)
  return guarded(() =>
    dbOf(options).$transaction(async tx => {
      const saved = id
        ? await tx.department.update({
            where: { id, ...ACTIVE },
            data: { name },
            select: { id: true },
          })
        : await tx.department.create({ data: { name }, select: { id: true } })
      await setHead(tx, saved.id, headId)
      return saved
    })
  )
}

/**
 * The departments a position exists in, replaced as a whole. A department that members still
 * hold the position in cannot be left out (they would hold a pair that does not exist).
 */
async function setDepartments(tx: Tx, positionId: string, departmentIds: string[]) {
  const departments = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM departments WHERE id = ANY(${departmentIds}) AND archived_at IS NULL FOR SHARE`
  if (departments.length !== departmentIds.length)
    throw new Refused({ field: 'departmentIds', reason: 'not_found' })
  // The pairs left out, locked before their holders are counted: a person given one of them
  // meanwhile (which reads the pair FOR SHARE) is either counted here or finds it gone.
  await tx.$queryRaw`
    SELECT 1 FROM department_positions
     WHERE position_id = ${positionId} AND NOT (department_id = ANY(${departmentIds}))
     FOR UPDATE`
  const dropped = { positionId, departmentId: { notIn: departmentIds } }
  const holders = await tx.employee.count({ where: { ...ACTIVE, ...dropped } })
  if (holders > 0) throw new Refused({ field: 'departmentIds', reason: 'in_use', count: holders })
  // An archived person still holds their pair (unarchiving needs it), so their pairs stay.
  const archivedHolders = await tx.employee.findMany({
    where: { archivedAt: { not: null }, ...dropped },
    select: { departmentId: true },
    distinct: ['departmentId'],
  })
  const kept = new Set(archivedHolders.map(e => e.departmentId))
  await tx.departmentPosition.deleteMany({
    where: {
      positionId,
      departmentId: { notIn: [...departmentIds, ...kept].filter(d => d !== null) },
    },
  })
  await tx.departmentPosition.createMany({
    data: departmentIds.map(departmentId => ({ departmentId, positionId })),
    skipDuplicates: true,
  })
}

/** A new position, or a renamed one, with the departments it exists in. */
export function savePosition(
  id: string | null,
  input: PositionInput,
  options?: RepoOptions
): Promise<GroupWrite> {
  const { name, departmentIds } = positionSchema.parse(input)
  return guarded(() =>
    dbOf(options).$transaction(async tx => {
      const saved = id
        ? await tx.position.update({
            where: { id, ...ACTIVE },
            data: { name },
            select: { id: true },
          })
        : await tx.position.create({ data: { name }, select: { id: true } })
      await setDepartments(tx, saved.id, departmentIds)
      return saved
    })
  )
}

/** A department's values for its form: its name, its head, and who can be head. */
export async function getDepartmentForEdit(id: string, options?: RepoOptions) {
  const department = await dbOf(options).department.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      name: true,
      employees: {
        where: { ...ACTIVE, ...stillEmployed() },
        select: { id: true, firstName: true, lastName: true, leadsDepartment: true },
      },
    },
  })
  if (!department) return null
  const members = department.employees
    .map(e => ({ id: e.id, name: sortName(e) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'cs'))
  return {
    id: department.id,
    name: department.name,
    headId: department.employees.find(e => e.leadsDepartment)?.id ?? null,
    members,
  }
}

/** A position's values for its form: its name and the departments it exists in. */
export async function getPositionForEdit(id: string, options?: RepoOptions) {
  const position = await dbOf(options).position.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      name: true,
      departments: { where: { department: ACTIVE }, select: { departmentId: true } },
    },
  })
  return (
    position && {
      id: position.id,
      name: position.name,
      departmentIds: position.departments.map(d => d.departmentId),
    }
  )
}

/** Every active department or position, for pickers. */
export async function listGroupOptions(
  kind: GroupKind,
  options?: RepoOptions
): Promise<{ id: string; name: string }[]> {
  const db = dbOf(options)
  const args = {
    where: ACTIVE,
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  } as const
  return kind === 'department' ? db.department.findMany(args) : db.position.findMany(args)
}

/** Which positions each active department has, for the person form's position picker. */
export async function listDepartmentPositions(
  options?: RepoOptions
): Promise<Record<string, string[]>> {
  const pairs = await dbOf(options).departmentPosition.findMany({
    where: { department: ACTIVE, position: ACTIVE },
    select: { departmentId: true, positionId: true },
  })
  const byDepartment: Record<string, string[]> = {}
  for (const p of pairs) (byDepartment[p.departmentId] ??= []).push(p.positionId)
  return byDepartment
}

/**
 * Sets a head for each department that has none, from its reporting lines (`headOf`). Run
 * once when heads became a stored fact, and by the seed; after that heads are set by hand.
 */
export async function fillDepartmentHeads(options?: RepoOptions): Promise<number> {
  const db = dbOf(options)
  const people = await db.employee.findMany({
    where: { ...ACTIVE, ...stillEmployed() },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      managerId: true,
      departmentId: true,
      leadsDepartment: true,
    },
  })
  const everyone = new Map(people.map(p => [p.id, p]))
  const byDepartment = Map.groupBy(
    people.filter(p => p.departmentId !== null),
    p => p.departmentId as string
  )
  let filled = 0
  for (const [departmentId, members] of byDepartment) {
    if (members.some(m => m.leadsDepartment)) continue
    // The reporting lines may point outside the department (everyone reports to someone
    // elsewhere): only a member can lead it, so such a department is left for the form.
    const head = headOf(members, everyone)
    if (!head || !members.some(m => m.id === head.id)) continue
    await db.$transaction(tx => setHead(tx, departmentId, head.id))
    filled++
  }
  return filled
}

/** Who leads each department now (their name, by department id), for the person form. */
export async function listDepartmentHeads(options?: RepoOptions): Promise<Record<string, string>> {
  const heads = await dbOf(options).employee.findMany({
    where: { ...ACTIVE, leadsDepartment: true, department: ACTIVE },
    select: { departmentId: true, firstName: true, lastName: true },
  })
  return Object.fromEntries(
    heads.flatMap(h => (h.departmentId ? [[h.departmentId, sortName(h)]] : []))
  )
}
