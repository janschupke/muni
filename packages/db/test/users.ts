import type { Db } from '../src/client'

/** The user integration tests book seats as. Its row id and Clerk id are both this value. */
export const TEST_USER = 'user_test'

/** Created once, in the template every test file copies (global-setup.ts). */
export async function createTestUser(db: Db): Promise<void> {
  await db.user.upsert({
    where: { clerkId: TEST_USER },
    create: { id: TEST_USER, clerkId: TEST_USER, syncedAt: new Date(0) },
    update: {},
  })
}
