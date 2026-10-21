import type { Role } from '@muni/domain/enums'
import { type ProviderEdit, providerEditSchema } from '@muni/domain/schemas'
import { type IsoDate, isoDateFromUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import { Prisma } from '../../generated/prisma/client'
import { ACTIVE, isArchived, type PersonRef, personSelect, toPersonRef } from '../archive/archive'
import { dbOf, nowOf, policyOf, type RepoOptions, toAmount } from '../core/context'
import { isPrismaCode } from '../core/errors'
import { lockSessionWrites } from '../scheduling/session-fit'
import { listSessions, upcomingSessionWhere } from '../scheduling/sessions'
import type { SessionListItem } from './courses'

// Training providers: who holds sessions and delivered the completions on record, with their
// contact details, what they offer and what was done with them. Prices follow the sanitisation
// policy for `completion.price`: a role that may not see a completion's price sees no sums of
// them either.

/** What was done with a provider, across all its completions or one course's. */
export interface ProviderTotals {
  completions: number
  people: number
  /** Sum of the recorded prices; null when none was recorded or the role may not see prices. */
  spend: number | null
  lastCompletedOn: IsoDate | null
}

export interface ProviderListItem extends ProviderTotals {
  id: string
  name: string
  companyId: string | null
  courses: number
}

export interface ProviderList {
  providers: ProviderListItem[]
  /** Whether the role may see prices; the spend column shows only then. */
  prices: boolean
}

/** A course a provider offers, at its price, with what is planned of it. */
interface ProviderOffering {
  courseId: string
  code: string
  name: string
  price: number
  /** The course's length: none set, nothing can be scheduled. */
  sessionMinutes: number | null
  /** The course's upcoming sessions this provider holds. */
  upcomingSessions: number
}

export interface ProviderDetail extends ProviderListItem {
  email: string | null
  phone: string | null
  website: string | null
  note: string | null
  /** Holds imported sessions that name no provider. */
  isDefault: boolean
  prices: boolean
  /** The courses it offers, by code. */
  offerings: ProviderOffering[]
  /** Its sessions still ahead (or under way), soonest first. */
  /** Planned sessions it holds that are still ahead (cancelled ones are not listed). */
  upcoming: SessionListItem[]
  /** Per course, most completions first. */
  byCourse: (ProviderTotals & { code: string; name: string })[]
  /** Every completion with it, newest first (its page pages them). */
  completionList: {
    /** Internal id (editing and archiving act on it). */
    id: string
    externalId: string
    employee: PersonRef
    courseCode: string
    courseName: string
    courseArchived: boolean
    completedOn: IsoDate
    validUntil: IsoDate | null
    price: number | null
  }[]
}

const pricesVisible = (role: Role, options: RepoOptions | undefined) =>
  policyOf(options)['completion.price'][role].mode === 'show'

interface TotalsRow {
  completions: number
  people: number
  courses: number
  spend: Prisma.Decimal | null
  last: Date | null
}

/** A provider no completion names yet. */
const NONE: TotalsRow = { completions: 0, people: 0, courses: 0, spend: null, last: null }

const TOTALS = Prisma.sql`
  count(*)::int AS completions,
  count(DISTINCT cc.employee_id)::int AS people,
  count(DISTINCT cc.course_id)::int AS courses,
  sum(cc.price) AS spend,
  max(cc.completed_on) AS last`

function totalsOf(row: TotalsRow, prices: boolean): ProviderTotals {
  return {
    completions: row.completions,
    people: row.people,
    spend: prices ? toAmount(row.spend) : null,
    lastCompletedOn: row.last ? isoDateFromUtc(row.last) : null,
  }
}

/**
 * Completion totals per provider; only `providerId`'s when given. Archived completions are
 * not counted; completions of people archived since still are (the training was delivered).
 */
function totalsByProvider(options: RepoOptions | undefined, providerId?: string) {
  const where = providerId
    ? Prisma.sql`cc.provider_id = ${providerId}`
    : Prisma.sql`cc.provider_id IS NOT NULL`
  return dbOf(options).$queryRaw<(TotalsRow & { id: string })[]>`
    SELECT cc.provider_id AS id, ${TOTALS}
      FROM course_completions cc
     WHERE ${where} AND cc.archived_at IS NULL
     GROUP BY cc.provider_id`
}

/** One provider's completion totals per course, most completions first. */
function totalsByCourse(options: RepoOptions | undefined, providerId: string) {
  return dbOf(options).$queryRaw<(TotalsRow & { code: string; name: string })[]>`
    SELECT c.code, c.name, ${TOTALS}
      FROM course_completions cc
      JOIN courses c ON c.id = cc.course_id
     WHERE cc.provider_id = ${providerId} AND cc.archived_at IS NULL
     GROUP BY c.code, c.name
     ORDER BY completions DESC, c.code`
}

export async function listProviders(role: Role, options?: RepoOptions): Promise<ProviderList> {
  const prices = pricesVisible(role, options)
  const [providers, totals] = await Promise.all([
    dbOf(options).provider.findMany({
      where: ACTIVE,
      select: { id: true, name: true, companyId: true },
      orderBy: { name: 'asc' },
    }),
    totalsByProvider(options),
  ])
  const byId = new Map(totals.map(t => [t.id, t]))
  return {
    prices,
    providers: providers.map(p => {
      const row = byId.get(p.id) ?? NONE
      return { ...p, ...totalsOf(row, prices), courses: row.courses }
    }),
  }
}

export async function getProvider(
  id: string,
  role: Role,
  options?: RepoOptions
): Promise<ProviderDetail | null> {
  const db = dbOf(options)
  const prices = pricesVisible(role, options)
  const now = nowOf(options)
  const [provider, [total = NONE], perCourse, recent, upcoming] = await Promise.all([
    db.provider.findFirst({
      where: { id, ...ACTIVE },
      select: {
        id: true,
        name: true,
        companyId: true,
        email: true,
        phone: true,
        website: true,
        note: true,
        isDefault: true,
        offerings: {
          where: { course: ACTIVE },
          select: {
            pricePerPerson: true,
            course: { select: { id: true, code: true, name: true, sessionMinutes: true } },
          },
          orderBy: { course: { code: 'asc' } },
        },
      },
    }),
    totalsByProvider(options, id),
    totalsByCourse(options, id),
    db.courseCompletion.findMany({
      where: { providerId: id, ...ACTIVE },
      orderBy: [{ completedOn: 'desc' }, { externalId: 'desc' }],
      select: {
        id: true,
        externalId: true,
        completedOn: true,
        validUntil: true,
        price: true,
        employee: { select: personSelect },
        course: { select: { code: true, name: true, archivedAt: true } },
      },
    }),
    listSessions({ window: 'upcoming', provider: id, status: 'PLANNED' }, { ...options, now }),
  ])
  if (!provider) return null
  const { offerings, ...record } = provider
  return {
    ...record,
    ...totalsOf(total, prices),
    courses: total.courses,
    prices,
    byCourse: perCourse.map(row => ({ code: row.code, name: row.name, ...totalsOf(row, prices) })),
    offerings: offerings.map(o => ({
      courseId: o.course.id,
      code: o.course.code,
      name: o.course.name,
      price: toAmount(o.pricePerPerson),
      sessionMinutes: o.course.sessionMinutes,
      upcomingSessions: upcoming.filter(s => s.courseCode === o.course.code).length,
    })),
    upcoming,
    completionList: recent.map(c => ({
      id: c.id,
      externalId: c.externalId,
      employee: toPersonRef(c.employee),
      courseCode: c.course.code,
      courseName: c.course.name,
      courseArchived: isArchived(c.course),
      completedOn: isoDateFromUtc(c.completedOn),
      validUntil: c.validUntil ? isoDateFromUtc(c.validUntil) : null,
      price: prices ? toAmount(c.price) : null,
    })),
  }
}

export async function getProviderForEdit(id: string, options?: RepoOptions) {
  const provider = await dbOf(options).provider.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      name: true,
      companyId: true,
      email: true,
      phone: true,
      website: true,
      note: true,
      isDefault: true,
      // An archived course's offering stays for when it comes back; the form leaves it alone.
      offerings: {
        where: { course: ACTIVE },
        select: { courseId: true, pricePerPerson: true },
        orderBy: { course: { code: 'asc' } },
      },
    },
  })
  if (!provider) return null
  return {
    ...provider,
    offerings: provider.offerings.map(o => ({
      courseId: o.courseId,
      price: toAmount(o.pricePerPerson),
    })),
  }
}

/**
 * A saved provider; or the unique field another provider already holds; or an offering the
 * form dropped that upcoming sessions of the provider still use (its course and how many).
 */
export type ProviderWrite =
  | { ok: true; id: string }
  | { ok: false; taken: 'name' | 'companyId' }
  | { ok: false; offeringInUse: { course: string; count: number } }

class OfferingInUse extends Error {
  constructor(
    readonly course: string,
    readonly count: number
  ) {
    super(`offering of ${course} in use by ${String(count)} sessions`)
  }
}

/**
 * Saves a provider and the courses it offers, under the sessions lock: an offering dropped
 * while upcoming sessions of the provider use it is refused, and making it the default takes
 * that from whichever provider had it. A changed price applies to sessions scheduled from now
 * on; those scheduled keep theirs.
 */
async function writeProvider(
  id: string | null,
  input: ProviderEdit,
  options: RepoOptions | undefined
): Promise<ProviderWrite> {
  const { offerings, isDefault, ...fields } = providerEditSchema.parse(input)
  const data = { ...fields, note: cleanFreeText(fields.note), isDefault }
  const db = dbOf(options)
  try {
    return await db.$transaction(async tx => {
      await lockSessionWrites(tx)
      if (isDefault)
        await tx.provider.updateMany({
          where: { isDefault: true, ...(id && { id: { not: id } }) },
          data: { isDefault: false },
        })
      const saved = id
        ? await tx.provider.update({ where: { id, ...ACTIVE }, data, select: { id: true } })
        : await tx.provider.create({ data, select: { id: true } })
      const kept = offerings.map(o => o.courseId)
      const dropped = await tx.providerCourse.findMany({
        where: { providerId: saved.id, courseId: { notIn: kept }, course: ACTIVE },
        select: { courseId: true, course: { select: { name: true } } },
      })
      for (const offering of dropped) {
        const count = await tx.courseSession.count({
          where: {
            providerId: saved.id,
            courseId: offering.courseId,
            ...upcomingSessionWhere(nowOf(options)),
          },
        })
        if (count > 0) throw new OfferingInUse(offering.course.name, count)
      }
      await tx.providerCourse.deleteMany({
        where: { providerId: saved.id, courseId: { in: dropped.map(d => d.courseId) } },
      })
      for (const o of offerings)
        await tx.providerCourse.upsert({
          where: { providerId_courseId: { providerId: saved.id, courseId: o.courseId } },
          create: { providerId: saved.id, courseId: o.courseId, pricePerPerson: o.price },
          update: { pricePerPerson: o.price },
        })
      return { ok: true as const, id: saved.id }
    })
  } catch (error) {
    if (error instanceof OfferingInUse)
      return { ok: false, offeringInUse: { course: error.course, count: error.count } }
    if (!isPrismaCode(error, 'P2002')) throw error
    // Name and IČO are the unique fields: the IČO is taken when someone else holds it.
    const holder =
      data.companyId &&
      (await db.provider.findFirst({
        where: { companyId: data.companyId, id: { not: id ?? '' }, ...ACTIVE },
        select: { id: true },
      }))
    return { ok: false, taken: holder ? 'companyId' : 'name' }
  }
}

export const createProvider = (input: ProviderEdit, options?: RepoOptions) =>
  writeProvider(null, input, options)

/**
 * Saves a provider's details and offerings; a new name renames it everywhere its completions
 * and sessions show. An unknown or archived id throws P2025.
 */
export const updateProvider = (id: string, input: ProviderEdit, options?: RepoOptions) =>
  writeProvider(id, input, options)
