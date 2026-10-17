import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { createDb } from './client'
import { findUserByClerkId, hitRateLimit, listUsers, upsertUserFromClerk } from './repositories'

const db = createDb()
const options = { db }
const PREFIX = 'user_it_'

const cleanUp = async () => {
  // Archived-by points at users too; clear it before the rows go.
  await db.user.updateMany({
    where: { clerkId: { startsWith: PREFIX } },
    data: { archivedAt: null, archivedById: null },
  })
  await db.user.deleteMany({ where: { clerkId: { startsWith: PREFIX } } })
  await db.rateLimit.deleteMany({ where: { key: { startsWith: PREFIX } } })
}
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
  clerkUpdatedAt: new Date('2026-10-16T09:00:00Z'),
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

  it('creates one row when two first requests come at once', async () => {
    const [a, b] = await Promise.all([
      upsertUserFromClerk(sync('race', { name: 'Rita' }), options),
      upsertUserFromClerk(sync('race', { name: 'Rita' }), options),
    ])
    expect(a.id).toBe(b.id)
    expect(await db.user.count({ where: { clerkId: `${PREFIX}race` } })).toBe(1)
  })

  it('keeps an archived user archived: signing in neither revives them nor makes a new row', async () => {
    const user = await upsertUserFromClerk(sync('gone', { name: 'Gustav', role: 'ADMIN' }), options)
    await db.user.update({
      where: { id: user.id },
      data: { archivedAt: new Date(), archivedById: user.id },
    })
    const again = await upsertUserFromClerk(sync('gone', { name: 'Gustav N.' }), options)
    expect(again).toMatchObject({ id: user.id, archived: true, name: 'Gustav', role: 'ADMIN' })
    expect(await findUserByClerkId(`${PREFIX}gone`, options)).toMatchObject({ archived: true })
    expect(await db.user.count({ where: { clerkId: `${PREFIX}gone` } })).toBe(1)
    expect((await listUsers(options)).some(u => u.id === user.id)).toBe(false)
  })

  it('keeps a role the app changed after Clerk last changed', async () => {
    const user = await upsertUserFromClerk(sync('late', { name: 'Lada', role: 'ADMIN' }), options)
    // An admin demotes her here at 09:30; Clerk has not been written yet.
    await db.user.update({
      where: { id: user.id },
      data: { role: 'VIEWER', roleChangedAt: new Date('2026-10-16T09:30:00Z') },
    })
    const stale = await upsertUserFromClerk(sync('late', { name: 'Lada', role: 'ADMIN' }), options)
    expect(stale.role).toBe('VIEWER')
    // Once Clerk has changed since, Clerk wins again (a change made in Clerk's dashboard).
    const fresh = await upsertUserFromClerk(
      sync('late', {
        name: 'Lada',
        role: 'FULL',
        clerkUpdatedAt: new Date('2026-10-16T09:45:00Z'),
      }),
      options
    )
    expect(fresh.role).toBe('FULL')
  })

  it('lists admins first, then by name', async () => {
    await upsertUserFromClerk(sync('b', { name: 'Bára', role: 'ADMIN' }), options)
    await upsertUserFromClerk(sync('c', { name: 'Cyril' }), options)
    const ours = (await listUsers(options)).filter(u => u.clerkId.startsWith(PREFIX))
    expect(ours.map(u => [u.name, u.role])).toEqual([
      ['Bára', 'ADMIN'],
      ['Alena', 'FULL'],
      ['Lada', 'FULL'],
      ['Cyril', 'VIEWER'],
      ['Rita', 'VIEWER'],
    ])
  })
})

describe('rate limits', () => {
  it('counts each key per minute, refuses past the limit, and keeps one window a key', async () => {
    const key = `${PREFIX}reads`
    const at = (time: string) => ({ ...options, now: new Date(`2026-10-17T10:${time}Z`) })
    const hits = await Promise.all(
      Array.from({ length: 4 }, () => hitRateLimit(key, 3, at('00:10')))
    )
    // Concurrent requests each get their own count: exactly one is over.
    expect(hits.filter(h => h.ok)).toHaveLength(3)
    expect(hits.filter(h => !h.ok)).toEqual([{ ok: false, retryAfterSeconds: 50 }])
    // Another key is counted apart.
    expect(await hitRateLimit(`${PREFIX}other`, 3, at('00:10'))).toEqual({ ok: true })
    // The next minute starts again, and the old window goes.
    expect(await hitRateLimit(key, 3, at('01:00'))).toEqual({ ok: true })
    expect(await db.rateLimit.count({ where: { key } })).toBe(1)
  })
})
