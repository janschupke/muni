import { createDb } from '@muni/db/client'

import { TEST_DB } from './server'

/**
 * The test database, for removing what an e2e run created (the app itself never deletes:
 * it archives). Only rows the specs name with their own prefixes are touched.
 */
export async function removeE2eRecords(): Promise<void> {
  const db = createDb(TEST_DB)
  try {
    const sessions = { externalId: { startsWith: 'S' } }
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
    const e2e = { name: { startsWith: 'E2E' } }
    await db.departmentPosition.deleteMany({
      where: { OR: [{ department: e2e }, { position: e2e }] },
    })
    await db.department.deleteMany({ where: e2e })
    await db.position.deleteMany({ where: e2e })
  } finally {
    await db.$disconnect()
  }
}
