import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { findUserByClerkId, listUsers, upsertUserFromClerk } from './repositories'

const db = createDb()
const options = { db }
const PREFIX = 'user_it_'

const cleanUp = () => db.user.deleteMany({ where: { clerkId: { startsWith: PREFIX } } })
beforeAll(cleanUp)
afterAll(async () => {
  await cleanUp()
  await db.$disconnect()
})

const sync = (clerkId: string, overrides: Partial<Parameters<typeof upsertUserFromClerk>[0]>) => ({
  clerkId: `${PREFIX}${clerkId}`,
  email: null,
  name: null,
  role: 'VIEWER' as const,
  sessionId: null,
  lastSignInAt: null,
  syncedAt: new Date('2026-10-16T10:00:00Z'),
  ...overrides,
})

describe('users', () => {
  it('creates a user from Clerk, then refreshes the same row', async () => {
    const created = await upsertUserFromClerk(
      sync('a', { email: 'a@example.com', name: 'Alena', sessionId: 'sess_1' }),
      options
    )
    expect(created).toMatchObject({ role: 'VIEWER', lastSessionId: 'sess_1', name: 'Alena' })

    const signedInAt = new Date('2026-10-16T11:00:00Z')
    const updated = await upsertUserFromClerk(
      sync('a', { name: 'Alena', role: 'FULL', sessionId: 'sess_2', lastSignInAt: signedInAt }),
      options
    )
    expect(updated.id).toBe(created.id)
    expect(updated).toMatchObject({
      role: 'FULL',
      lastSessionId: 'sess_2',
      lastSignInAt: signedInAt,
    })
    expect(await findUserByClerkId(`${PREFIX}a`, options)).toEqual(updated)
    expect(await findUserByClerkId(`${PREFIX}missing`, options)).toBeNull()
  })

  it('lists admins first, then by name', async () => {
    await upsertUserFromClerk(sync('b', { name: 'Bára', role: 'ADMIN' }), options)
    await upsertUserFromClerk(sync('c', { name: 'Cyril' }), options)
    const ours = (await listUsers(options)).filter(u => u.clerkId.startsWith(PREFIX))
    expect(ours.map(u => [u.name, u.role])).toEqual([
      ['Bára', 'ADMIN'],
      ['Alena', 'FULL'],
      ['Cyril', 'VIEWER'],
    ])
  })
})
