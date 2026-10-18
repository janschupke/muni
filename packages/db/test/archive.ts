import type { Db } from '../src/client'

const UNARCHIVE = {
  where: { archivedAt: { not: null } },
  data: { archivedAt: null, archivedById: null },
}

/**
 * Brings every archived record back, so the suites' pinned counts hold even after a failed
 * run. Run it after deleting the rows a suite created (an active twin would block it) and
 * before re-seeding (seeding skips what is archived).
 */
export async function unarchiveAll(db: Db): Promise<void> {
  await db.courseCompletion.updateMany(UNARCHIVE)
  await db.courseSession.updateMany(UNARCHIVE)
  await db.employee.updateMany(UNARCHIVE)
  await db.course.updateMany(UNARCHIVE)
  await db.department.updateMany(UNARCHIVE)
  await db.position.updateMany(UNARCHIVE)
  await db.room.updateMany(UNARCHIVE)
  await db.provider.updateMany(UNARCHIVE)
  await db.user.updateMany(UNARCHIVE)
}

/** Deletes courses and everything under them (no foreign key cascades any more). Tests only. */
export async function deleteCourses(db: Db, where: { code: { startsWith: string } }) {
  const course = where
  await db.sessionAssignment.deleteMany({ where: { session: { course } } })
  await db.courseSession.deleteMany({ where: { course } })
  await db.courseCompletion.deleteMany({ where: { course } })
  await db.providerCourse.deleteMany({ where: { course } })
  await db.courseCapability.deleteMany({ where: { course } })
  await db.courseDepartmentRequirement.deleteMany({ where: { course } })
  await db.coursePositionRequirement.deleteMany({ where: { course } })
  await db.course.deleteMany({ where })
}

/** Deletes rooms and their capabilities. Their sessions must be gone already. Tests only. */
export async function deleteRooms(db: Db, name: string[] | { startsWith: string }) {
  const where = { name: Array.isArray(name) ? { in: name } : name }
  await db.roomCapability.deleteMany({ where: { room: where } })
  await db.room.deleteMany({ where })
}

/**
 * Deletes providers, their offerings and sessions (and those sessions' bookings). Their
 * completions must be gone already. Tests only.
 */
export async function deleteProviders(db: Db, name: { startsWith: string }) {
  const provider = { name }
  await db.sessionAssignment.deleteMany({ where: { session: { provider } } })
  await db.courseSession.deleteMany({ where: { provider } })
  await db.providerCourse.deleteMany({ where: { provider } })
  await db.provider.deleteMany({ where: { name } })
}
