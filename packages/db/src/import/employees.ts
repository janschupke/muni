import { type EmployeeInput } from '@muni/domain/schemas'
import { isoDateToUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive/archive'
import type { CommitResult } from './shared'
import { archivedOnly, partition, upsertNames, withoutArchived } from './shared'

/** Employee records that touch nothing archived (shared by both employee passes). */
export async function activeEmployeeRecords(tx: Tx, all: EmployeeInput[]) {
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

export async function writeEmployees(tx: Tx, records: EmployeeInput[]): Promise<CommitResult> {
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
export async function linkManagers(tx: Tx, records: EmployeeInput[]): Promise<void> {
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
