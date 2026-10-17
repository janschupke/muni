import type { Role } from '@muni/domain/enums'
import { type ProviderInput, providerSchema } from '@muni/domain/schemas'
import { type IsoDate, isoDateFromUtc } from '@muni/utils/dates'
import { cleanFreeText } from '@muni/utils/text'

import { Prisma } from '../generated/prisma/client'
import { ACTIVE, isArchived, type PersonRef, personSelect, toPersonRef } from './archive'
import { dbOf, getPolicy, type RepoOptions, toAmount } from './context'
import { isPrismaCode } from './errors'

// Training providers: who delivered the completions on record, with their contact details
// and what was done with them. Prices follow the sanitisation policy for `completion.price`:
// a role that may not see a completion's price sees no sums of them either.

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

export interface ProviderDetail extends ProviderListItem {
  email: string | null
  phone: string | null
  website: string | null
  note: string | null
  prices: boolean
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

const pricesVisible = (role: Role) => getPolicy()['completion.price'][role].mode === 'show'

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
  const prices = pricesVisible(role)
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
  const prices = pricesVisible(role)
  const [provider, [total = NONE], perCourse, recent] = await Promise.all([
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
  ])
  if (!provider) return null
  return {
    ...provider,
    ...totalsOf(total, prices),
    courses: total.courses,
    prices,
    byCourse: perCourse.map(row => ({ code: row.code, name: row.name, ...totalsOf(row, prices) })),
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

export function getProviderForEdit(id: string, options?: RepoOptions) {
  return dbOf(options).provider.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      name: true,
      companyId: true,
      email: true,
      phone: true,
      website: true,
      note: true,
    },
  })
}

/** A saved provider, or the unique field another provider already holds. */
export type ProviderWrite = { ok: true; id: string } | { ok: false; taken: 'name' | 'companyId' }

async function writeProvider(
  id: string | null,
  input: ProviderInput,
  options: RepoOptions | undefined
): Promise<ProviderWrite> {
  const parsed = providerSchema.parse(input)
  const data = { ...parsed, note: cleanFreeText(parsed.note) }
  const db = dbOf(options)
  try {
    const saved = id
      ? await db.provider.update({ where: { id, ...ACTIVE }, data, select: { id: true } })
      : await db.provider.create({ data, select: { id: true } })
    return { ok: true, id: saved.id }
  } catch (error) {
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

export const createProvider = (input: ProviderInput, options?: RepoOptions) =>
  writeProvider(null, input, options)

/**
 * Saves a provider's details; a new name renames it everywhere its completions show. An
 * unknown or archived id throws P2025.
 */
export const updateProvider = (id: string, input: ProviderInput, options?: RepoOptions) =>
  writeProvider(id, input, options)
