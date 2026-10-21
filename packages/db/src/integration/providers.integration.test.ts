import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { completionOf } from '../../test/records'
import { createDb } from '../connect'
import {
  archiveImpact,
  createCompletion,
  createProvider,
  createSession,
  getProvider,
  getProviderForEdit,
  getSession,
  listCourseOptions,
  listProviders,
  updateProvider,
} from '../repositories'
import { getPolicy } from '../repositories/core/context'
import { seedFromDirectory } from '../seed'

const db = createDb()
const asOf = '2026-10-16'
const options = { db, asOf, now: new Date('2026-10-16T12:00:00Z') }
const DATA_DIR = path.join(import.meta.dirname, '../../../../data')

const details = { companyId: null, email: null, phone: null, website: null, note: null }
/** A provider form with no details, not the default, offering nothing. */
const blank = { ...details, isDefault: false, offerings: [] }

afterAll(async () => {
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
    // Every completion with it, newest first.
    const recent = provider?.completionList ?? []
    expect(recent).toHaveLength(provider?.completions ?? -1)
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
      expect([c.employee, c.courseCode]).toEqual([
        {
          archived: false,
          externalId: row?.employee.externalId,
          name: `${row?.employee.lastName ?? ''} ${row?.employee.firstName ?? ''}`,
        },
        row?.course.code,
      ])
    }
    expect(await getProvider('nope', 'VIEWER', options)).toBeNull()
  })

  it('withholds every price, sums included, from a viewer the policy hides them from', async () => {
    const shown = getPolicy()
    const hidden = {
      ...options,
      policy: {
        ...shown,
        'completion.price': { ...shown['completion.price'], VIEWER: { mode: 'omit' as const } },
      },
    }
    const { providers, prices } = await listProviders('VIEWER', hidden)
    expect(prices).toBe(false)
    expect(providers.every(p => p.spend === null && p.completions > 0)).toBe(true)
    const provider = await getProvider(providers[0]?.id ?? '', 'VIEWER', hidden)
    expect(provider?.prices).toBe(false)
    expect(provider?.spend).toBeNull()
    expect(provider?.byCourse.every(c => c.spend === null)).toBe(true)
    expect(provider?.completionList.every(c => c.price === null)).toBe(true)
    // The full role still sees them.
    expect((await listProviders('FULL', hidden)).prices).toBe(true)
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
      completionList: [],
    })
    // A completion recorded in the app names it; no price and no expiry stay empty.
    await createCompletion(
      await completionOf(db, {
        employee: 'E0153',
        course: 'LEAD',
        completedOn: asOf,
        provider: 'Druhý dodavatel',
      }),
      options
    )
    expect(await getProvider(created.id, 'FULL', options)).toMatchObject({
      completions: 1,
      people: 1,
      courses: 1,
      spend: null,
      lastCompletedOn: asOf,
      byCourse: [{ code: 'LEAD', completions: 1, spend: null }],
      completionList: [{ courseCode: 'LEAD', validUntil: null, price: null }],
    })
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
        isDefault: false,
        offerings: [],
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
      isDefault: false,
      offerings: [],
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

  it('keeps the details entered in the app through a re-import', async () => {
    const internal = await db.provider.findUniqueOrThrow({ where: { name: 'Interní školitel' } })
    const form = await getProviderForEdit(internal.id, options)
    if (!form) throw new Error('fixture')
    await updateProvider(internal.id, { ...form, email: 'skoleni@vzorova.example' }, options)
    await seedFromDirectory(db, DATA_DIR, asOf)
    expect(await getProviderForEdit(internal.id, options)).toMatchObject({
      name: 'Interní školitel',
      email: 'skoleni@vzorova.example',
    })
  })
})

describe('what a provider offers', () => {
  it('saves the courses it offers at their prices, and refuses each course twice', async () => {
    const [bozp, gdpr] = await Promise.all(
      ['BOZP-Z', 'GDPR'].map(code => db.course.findFirstOrThrow({ where: { code } }))
    )
    if (!bozp || !gdpr) throw new Error('fixture')
    const created = await createProvider(
      {
        ...blank,
        name: 'Třetí dodavatel',
        offerings: [
          { courseId: bozp.id, price: 450 },
          { courseId: gdpr.id, price: 0 },
        ],
      },
      options
    )
    if (!created.ok) throw new Error('not created')
    expect((await getProviderForEdit(created.id, options))?.offerings).toEqual([
      { courseId: bozp.id, price: 450 },
      { courseId: gdpr.id, price: 0 },
    ])
    expect(await getProvider(created.id, 'FULL', options)).toMatchObject({
      offerings: [
        { code: 'BOZP-Z', price: 450, upcomingSessions: 0 },
        { code: 'GDPR', price: 0, upcomingSessions: 0 },
      ],
      upcoming: [],
    })
    // The course list and the session form see it among the course's providers.
    const options_ = (await listCourseOptions(options)).find(c => c.code === 'BOZP-Z')
    expect(options_?.offerings).toContainEqual({
      providerId: created.id,
      providerName: 'Třetí dodavatel',
      price: 450,
      isDefault: false,
    })
    // A session it holds keeps the offering it uses: dropping that one is refused.
    const room = await db.room.findFirstOrThrow({ where: { name: 'Aula A' } })
    const session = await createSession(
      {
        courseId: bozp.id,
        providerId: created.id,
        date: '2027-04-06',
        startTime: '07:00',
        roomId: room.id,
        capacity: 10,
      },
      options
    )
    expect(session).toMatchObject({ ok: true })
    expect(
      await updateProvider(
        created.id,
        { ...blank, name: 'Třetí dodavatel', offerings: [{ courseId: gdpr.id, price: 0 }] },
        options
      )
    ).toEqual({ ok: false, offeringInUse: { course: bozp.name, count: 1 } })
    // A new price is saved; the session keeps the one it was scheduled at.
    expect(
      await updateProvider(
        created.id,
        {
          ...blank,
          name: 'Třetí dodavatel',
          offerings: [{ courseId: bozp.id, price: 500 }],
        },
        options
      )
    ).toEqual({ ok: true, id: created.id })
    if (!session.ok) return
    expect((await getSession(session.externalId, options))?.pricePerPerson).toBe(450)
    // Its page lists the session ahead, as the sessions list does, and counts it on the offering.
    expect(await getProvider(created.id, 'FULL', options)).toMatchObject({
      offerings: [{ code: 'BOZP-Z', upcomingSessions: 1 }],
      upcoming: [
        {
          externalId: session.externalId,
          courseCode: 'BOZP-Z',
          provider: { id: created.id, name: 'Třetí dodavatel' },
          pricePerPerson: 450,
        },
      ],
    })
    // While it holds a session ahead, it is not archived.
    expect(await archiveImpact('provider', created.id, options)).toEqual({
      ok: false,
      reason: 'IN_USE',
      count: 1,
    })
  })

  it('has one default, which is not archived; making another the default moves it', async () => {
    const internal = await db.provider.findUniqueOrThrow({ where: { name: 'Interní školitel' } })
    expect(internal.isDefault).toBe(true)
    expect(await archiveImpact('provider', internal.id, options)).toEqual({
      ok: false,
      reason: 'DEFAULT_PROVIDER',
      count: 0,
    })
    const created = await createProvider(
      { ...blank, name: 'Čtvrtý dodavatel', isDefault: true },
      options
    )
    if (!created.ok) throw new Error('not created')
    const defaults = await db.provider.findMany({
      where: { isDefault: true },
      select: { id: true },
    })
    expect(defaults).toEqual([{ id: created.id }])
    // At most one, even written past the app.
    await expect(
      db.provider.update({ where: { id: internal.id }, data: { isDefault: true } })
    ).rejects.toMatchObject({ code: 'P2002' })
    // An offering's price is never below zero.
    await expect(
      db.providerCourse.create({
        data: {
          providerId: created.id,
          courseId: (await db.course.findFirstOrThrow({ where: { code: 'ANGL' } })).id,
          pricePerPerson: -1,
        },
      })
    ).rejects.toThrow(/provider_courses_price_check/)
  })
})
