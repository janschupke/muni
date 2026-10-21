import { describe, expect, it, vi } from 'vitest'

import { getDb } from '../../client'
import { createDb, tlsFor } from '../../connect'
import { complianceOptions, dbOf } from './context'

const asOf = '2026-10-16'

describe('settings from the environment', () => {
  it('reads the expiring window, falling back to 30 days on anything but a positive whole number', () => {
    vi.stubEnv('MUNI_EXPIRING_DAYS', '45')
    expect(complianceOptions(asOf)).toEqual({ asOf, expiringWithinDays: 45 })
    for (const value of ['abc', '-5', '7.5']) {
      vi.stubEnv('MUNI_EXPIRING_DAYS', value)
      expect(complianceOptions(asOf).expiringWithinDays).toBe(30)
    }
  })
})

describe('the client', () => {
  it('needs a connection string', () => {
    expect(() => createDb('')).toThrow('DATABASE_URL is not set')
  })

  it('reaches a database on another host only over TLS, checked against its CA', () => {
    expect(tlsFor('postgresql://muni@localhost:5439/muni_test', undefined)).toBeUndefined()
    expect(tlsFor('postgresql://muni@127.0.0.1:5432/muni', undefined)).toBeUndefined()
    const remote = 'postgresql://postgres.x@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
    expect(() => tlsFor(remote, undefined)).toThrow('DATABASE_CA is not set')
    expect(() => tlsFor(remote, '')).toThrow('DATABASE_CA is not set')
    expect(tlsFor(remote, 'PEM')).toEqual({ ca: 'PEM', rejectUnauthorized: true })
  })

  it('shares one lazy client per process, connecting only when asked', async () => {
    // Nothing listens here: a client that connected on creation would fail.
    vi.stubEnv('DATABASE_URL', 'postgresql://nobody@localhost:1/none')
    const client = getDb()
    expect(getDb()).toBe(client)
    expect(dbOf()).toBe(client)
    await client.$disconnect()
  })
})
