import { createDb } from '@muni/db/connect'

import { TEST_DB } from './server'

/**
 * The test database, for removing what an e2e run created (the app itself never deletes:
 * it archives). Only rows the specs name with their own prefixes are touched.
 */
export async function removeE2eRecords(): Promise<void> {
  const db = createDb(TEST_DB)
  try {
    const e2e = { name: { startsWith: 'E2E' } }
    const course = { code: { startsWith: 'E2E' } }
    // Sessions the app created, and any of an e2e course, room or provider.
    const sessions = {
      OR: [{ externalId: { startsWith: 'S' } }, { course }, { room: e2e }, { provider: e2e }],
    }
    await db.sessionAssignment.deleteMany({
      where: {
        OR: [
          { session: sessions },
          { employee: { lastName: { startsWith: 'E2E' } } },
          // Bookings the e2e accounts made on seeded sessions (the advisor's).
          { createdBy: { email: { endsWith: '+clerk_test@example.com' } } },
        ],
      },
    })
    await db.courseSession.deleteMany({ where: sessions })
    await db.courseCompletion.deleteMany({
      where: { employee: { lastName: { startsWith: 'E2E' } } },
    })
    await db.employee.deleteMany({ where: { lastName: { startsWith: 'E2E' } } })
    // A test that made an e2e provider the default gives it back to the internal one.
    if (await db.provider.findFirst({ where: { ...e2e, isDefault: true } })) {
      await db.provider.updateMany({ where: e2e, data: { isDefault: false } })
      await db.provider.updateMany({
        where: { name: 'Interní školitel', archivedAt: null },
        data: { isDefault: true },
      })
    }
    await db.providerCourse.deleteMany({ where: { OR: [{ provider: e2e }, { course }] } })
    await db.provider.deleteMany({ where: e2e })
    await db.courseCompletion.deleteMany({ where: { course } })
    await db.courseCapability.deleteMany({ where: { course } })
    await db.courseDepartmentRequirement.deleteMany({ where: { course } })
    await db.coursePositionRequirement.deleteMany({ where: { course } })
    await db.course.deleteMany({ where: course })
    await db.roomCapability.deleteMany({ where: { room: e2e } })
    await db.room.deleteMany({ where: e2e })
    await db.departmentPosition.deleteMany({
      where: { OR: [{ department: e2e }, { position: e2e }] },
    })
    await db.department.deleteMany({ where: e2e })
    await db.position.deleteMany({ where: e2e })
  } finally {
    await db.$disconnect()
  }
}
