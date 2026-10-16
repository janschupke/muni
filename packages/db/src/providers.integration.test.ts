import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createDb } from './client'
import {
  createCompletion,
  createProvider,
  deleteProvider,
  getProvider,
  getProviderForEdit,
  listProviders,
  updateProvider,
} from './repositories'
import type * as Context from './repositories/context'
import { seedFromDirectory } from './seed'

// Whether the policy withholds prices from viewers (the default shows them).
const policy = vi.hoisted(() => ({ hidePrices: false }))
vi.mock('./repositories/context', async importOriginal => {
  const actual = await importOriginal<typeof Context>()
  return {
    ...actual,
    getPolicy: () => {
      const loaded = actual.getPolicy()
      return policy.hidePrices
        ? {
            ...loaded,
            'completion.price': { ...loaded['completion.price'], VIEWER: { mode: 'omit' } },
          }
        : loaded
    },
  }
})

const db = createDb()
const asOf = '2026-10-16'
const options = { db, asOf }
const DATA_DIR = path.join(import.meta.dirname, '../../../data')
const CREATED = [
  'Zkušební dodavatel',
  'Zkušební dodavatel s.r.o.',
  'Druhý dodavatel',
  'Třetí dodavatel',
]

const blank = { companyId: null, email: null, phone: null, website: null, note: null }

const cleanUp = async () => {
  await db.courseCompletion.deleteMany({
    where: { externalId: { startsWith: 'A' }, provider: { name: { in: CREATED } } },
  })
  await db.provider.deleteMany({ where: { name: { in: CREATED } } })
  await db.provider.updateMany({ data: blank })
}

beforeAll(async () => {
  await seedFromDirectory(db, DATA_DIR, asOf)
  await cleanUp()
})

afterAll(async () => {
  await cleanUp()
  await db.$disconnect()
})

describe('provider figures', () => {
  it('lists every provider with what was done with it, counted again here', async () => {
    const { providers, prices } = await listProviders('FULL', options)
    expect(prices).toBe(true)
    expect(providers.map(p => p.name)).toEqual([
      'E-learning portál',
      'Externí lektor',
      'Interní školitel',
      'Vzorový školicí ústav',
    ])
    for (const p of providers) {
      const where = { providerId: p.id }
      const [count, sum, last, people, courses] = await Promise.all([
        db.courseCompletion.count({ where }),
        db.courseCompletion.aggregate({ where, _sum: { price: true } }),
        db.courseCompletion.aggregate({ where, _max: { completedOn: true } }),
        db.courseCompletion.findMany({ where, distinct: ['employeeId'], select: { id: true } }),
        db.courseCompletion.findMany({ where, distinct: ['courseId'], select: { id: true } }),
      ])
      expect(p).toMatchObject({
        completions: count,
        people: people.length,
        courses: courses.length,
        spend: Number(sum._sum.price),
        lastCompletedOn: last._max.completedOn?.toISOString().slice(0, 10),
      })
    }
    // Every completion names one of them.
    expect(providers.reduce((n, p) => n + p.completions, 0)).toBe(
      await db.courseCompletion.count({ where: { providerId: { not: null } } })
    )
  })

  it('shows one provider: its totals, per course, and its latest completions', async () => {
    const { providers } = await listProviders('VIEWER', options)
    const listed = providers.find(p => p.name === 'Interní školitel')
    const provider = await getProvider(listed?.id ?? '', 'VIEWER', options)
    expect(provider).toMatchObject({ ...listed, prices: true, email: null })
    const byCourse = provider?.byCourse ?? []
    expect(byCourse.reduce((n, c) => n + c.completions, 0)).toBe(provider?.completions)
    expect(byCourse.map(c => c.completions)).toEqual(
      byCourse.map(c => c.completions).sort((a, b) => b - a)
    )
    const spend = byCourse.reduce((n, c) => n + (c.spend ?? 0), 0)
    expect(spend).toBeCloseTo(provider?.spend ?? 0)
    const recent = provider?.recentCompletions ?? []
    expect(recent).toHaveLength(20)
    expect(recent.map(c => c.completedOn)).toEqual(
      recent.map(c => c.completedOn).sort((a, b) => b.localeCompare(a))
    )
    // They are this provider's, with the person and course they name.
    const stored = await db.courseCompletion.findMany({
      where: { externalId: { in: recent.map(c => c.externalId) } },
      select: {
        externalId: true,
        providerId: true,
        employee: { select: { externalId: true, lastName: true, firstName: true } },
        course: { select: { code: true } },
      },
    })
    for (const c of recent) {
      const row = stored.find(r => r.externalId === c.externalId)
      expect(row?.providerId).toBe(listed?.id)
      expect([c.employeeExternalId, c.employeeName, c.courseCode]).toEqual([
        row?.employee.externalId,
        `${row?.employee.lastName ?? ''} ${row?.employee.firstName ?? ''}`,
        row?.course.code,
      ])
    }
    expect(await getProvider('nope', 'VIEWER', options)).toBeNull()
  })

  it('withholds every price, sums included, from a viewer the policy hides them from', async () => {
    policy.hidePrices = true
    try {
      const { providers, prices } = await listProviders('VIEWER', options)
      expect(prices).toBe(false)
      expect(providers.every(p => p.spend === null && p.completions > 0)).toBe(true)
      const provider = await getProvider(providers[0]?.id ?? '', 'VIEWER', options)
      expect(provider?.prices).toBe(false)
      expect(provider?.spend).toBeNull()
      expect(provider?.byCourse.every(c => c.spend === null)).toBe(true)
      expect(provider?.recentCompletions.every(c => c.price === null)).toBe(true)
      // The full role still sees them.
      expect((await listProviders('FULL', options)).prices).toBe(true)
    } finally {
      policy.hidePrices = false
    }
  })
})

describe('a new provider', () => {
  it('has nothing done yet, then counts what is recorded with it', async () => {
    const created = await createProvider({ ...blank, name: 'Druhý dodavatel' }, options)
    if (!created.ok) throw new Error('not created')
    const empty = (await listProviders('FULL', options)).providers.find(p => p.id === created.id)
    expect(empty).toMatchObject({ completions: 0, people: 0, courses: 0, spend: null })
    expect(await getProvider(created.id, 'FULL', options)).toMatchObject({
      completions: 0,
      lastCompletedOn: null,
      byCourse: [],
      recentCompletions: [],
    })
    // A completion recorded in the app names it; no price and no expiry stay empty.
    await createCompletion(
      'E0153',
      {
        courseCode: 'LEAD',
        completedOn: asOf,
        validUntil: null,
        provider: 'Druhý dodavatel',
        price: null,
        note: null,
      },
      options
    )
    expect(await getProvider(created.id, 'FULL', options)).toMatchObject({
      completions: 1,
      people: 1,
      courses: 1,
      spend: null,
      lastCompletedOn: asOf,
      byCourse: [{ code: 'LEAD', completions: 1, spend: null }],
      recentCompletions: [{ courseCode: 'LEAD', validUntil: null, price: null }],
    })
    expect(await deleteProvider(created.id, options)).toBe('IN_USE')
  })
})

describe('provider records', () => {
  it('creates one with details, renames it, and refuses a taken name or IČO', async () => {
    const created = await createProvider(
      {
        name: ' Zkušební dodavatel ',
        companyId: '002 16 224',
        email: 'kurzy@dodavatel.example',
        phone: '+420 600 000 000',
        website: 'dodavatel.example',
        note: '  Smlouva do 2027  ',
      },
      options
    )
    if (!created.ok) throw new Error('not created')
    const { id } = created
    expect(await getProviderForEdit(id, options)).toEqual({
      id,
      name: 'Zkušební dodavatel',
      companyId: '00216224',
      email: 'kurzy@dodavatel.example',
      phone: '+420 600 000 000',
      website: 'https://dodavatel.example',
      note: 'Smlouva do 2027',
    })
    expect(
      await updateProvider(id, { ...blank, name: 'Zkušební dodavatel s.r.o.' }, options)
    ).toEqual({ ok: true, id })
    expect(await getProviderForEdit(id, options)).toMatchObject({
      name: 'Zkušební dodavatel s.r.o.',
      companyId: null,
    })
    expect(await createProvider({ ...blank, name: 'Interní školitel' }, options)).toEqual({
      ok: false,
      taken: 'name',
    })
    await updateProvider(
      id,
      { ...blank, name: 'Zkušební dodavatel s.r.o.', companyId: '45274649' },
      options
    )
    expect(
      await createProvider({ ...blank, name: 'Třetí dodavatel', companyId: '45274649' }, options)
    ).toEqual({ ok: false, taken: 'companyId' })
    // Taken on an update too: someone else's name or IČO, never its own.
    expect(
      await updateProvider(id, { ...blank, name: 'Externí lektor', companyId: '45274649' }, options)
    ).toEqual({ ok: false, taken: 'name' })
    expect(
      await createProvider({ ...blank, name: 'Externí lektor', companyId: '00216224' }, options)
    ).toEqual({ ok: false, taken: 'name' })
    expect(await getProviderForEdit('nope', options)).toBeNull()
    await expect(
      updateProvider('nope', { ...blank, name: 'Nikdo' }, options)
    ).rejects.toMatchObject({
      code: 'P2025',
    })
  })

  it('deletes a provider no completion names, and keeps one that some do', async () => {
    const created = await createProvider({ ...blank, name: 'Třetí dodavatel' }, options)
    if (!created.ok) throw new Error('not created')
    expect(await deleteProvider(created.id, options)).toBe('DELETED')
    expect(await getProviderForEdit(created.id, options)).toBeNull()
    const used = await db.provider.findUniqueOrThrow({ where: { name: 'Externí lektor' } })
    expect(await deleteProvider(used.id, options)).toBe('IN_USE')
    expect(await db.courseCompletion.count({ where: { providerId: used.id } })).toBeGreaterThan(0)
    await expect(deleteProvider('nope', options)).rejects.toMatchObject({ code: 'P2025' })
  })

  it('keeps the details entered in the app through a re-import', async () => {
    const internal = await db.provider.findUniqueOrThrow({ where: { name: 'Interní školitel' } })
    await updateProvider(
      internal.id,
      { ...blank, name: 'Interní školitel', email: 'skoleni@vzorova.example' },
      options
    )
    await seedFromDirectory(db, DATA_DIR, asOf)
    expect(await getProviderForEdit(internal.id, options)).toMatchObject({
      name: 'Interní školitel',
      email: 'skoleni@vzorova.example',
    })
  })
})
