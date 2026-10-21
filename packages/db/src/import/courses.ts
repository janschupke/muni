import { type CourseInput } from '@muni/domain/schemas'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive/archive'
import type { CommitResult } from './shared'
import { archivedOnly, differs, lookup, sameSet, upsertNames, withoutArchived } from './shared'

const departmentsOf = (r: CourseInput) =>
  r.requirements.flatMap(q => (q.scope === 'DEPARTMENT' ? [q.department] : []))
const positionsOf = (r: CourseInput) =>
  r.requirements.flatMap(q => (q.scope === 'POSITION' ? [q.position] : []))

export async function writeCourses(tx: Tx, all: CourseInput[]): Promise<CommitResult> {
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
  const departments = await upsertNames(tx, 'department', records.flatMap(departmentsOf))
  const positions = await upsertNames(tx, 'position', records.flatMap(positionsOf))
  let created = 0
  let updated = 0
  let unchanged = 0
  for (const record of records) {
    const existing = await tx.course.findFirst({
      where: { code: record.code, ...ACTIVE },
      select: {
        id: true,
        name: true,
        validityMonths: true,
        requiredForAll: true,
        departmentRequirements: { select: { departmentId: true } },
        positionRequirements: { select: { positionId: true } },
      },
    })
    // The catalog says who must hold the course; what a session needs is set in the app
    // (or derived from sessions) and never touched by an import.
    const audience = {
      name: record.name,
      validityMonths: record.validityMonths,
      requiredForAll: record.requirements.some(q => q.scope === 'ALL'),
    }
    if (
      existing &&
      !differs(existing, audience) &&
      sameSet(
        existing.departmentRequirements.map(q => q.departmentId),
        departmentsOf(record).map(name => lookup(departments, name, 'department'))
      ) &&
      sameSet(
        existing.positionRequirements.map(q => q.positionId),
        positionsOf(record).map(name => lookup(positions, name, 'position'))
      )
    ) {
      unchanged++
      continue
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
  return { created, updated, unchanged, skipped }
}
