import { afterAll, describe, expect, it } from 'vitest'

import { createDb } from '../connect'

const db = createDb()

afterAll(async () => {
  await db.$disconnect()
})

describe('the database outside the app', () => {
  it('has row-level security on every table: a role but the owner gets no rows', async () => {
    const open = await db.$queryRaw<{ table: string }[]>`
      SELECT c.relname AS table FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
      ORDER BY 1`
    // A new table must turn it on in its migration (see 20261027090000_row_level_security).
    expect(open.map(t => t.table)).toEqual([])
  })
})
