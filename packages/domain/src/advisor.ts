import { diffInDays, toZonedParts, type IsoDate } from '@muni/utils/dates'
import * as z from 'zod'

import type { ComplianceCounts } from './compliance'

/*
 * The advisor: who should go to which upcoming session.
 *
 * A deliberately simple, explainable greedy plan. Every open need gets a priority from its
 * status; needs are served most urgent first, each taking the best-scoring session that still
 * has room. Every score is a sum of named terms, and the terms are returned with it, so the UI
 * can show exactly why a suggestion was made. Same input, same plan: input order never matters.
 */

export type NeedStatus = 'EXPIRED' | 'MISSING' | 'EXPIRING'

export interface AdvisorNeed {
  employee: {
    externalId: string
    name: string
    department: string | null
    status: 'ACTIVE' | 'PARENTAL_LEAVE'
  }
  course: { code: string; name: string }
  status: NeedStatus
  /** Current training's expiry (EXPIRED, EXPIRING); null when it was never completed. */
  validUntil: IsoDate | null
}

export interface AdvisorSession {
  externalId: string
  courseCode: string
  courseName: string
  location: string
  startsAt: string
  endsAt: string
  capacity: number
  unnamedBookings: number
  /** Employee external IDs already booked by name. */
  assigned: string[]
  pricePerPerson: number | null
  status: 'PLANNED' | 'CANCELLED'
}

export interface AdvisorInput {
  asOf: IsoDate
  expiringWithinDays: number
  needs: AdvisorNeed[]
  /** Upcoming sessions (any status; cancelled ones are ignored). */
  sessions: AdvisorSession[]
  /** Compliance counts over active employees, the base of the projected rate. */
  activeCounts: ComplianceCounts
}

// ---------------------------------------------------------------------------------------------
// Settings

const bounded = (min: number, max: number, fallback: number, step = 1) =>
  z.coerce
    .number()
    .catch(fallback)
    // toFixed drops binary noise (0.3 stepped from 0.27 would be 0.30000000000000004).
    .transform(v => Number(Math.min(max, Math.max(min, Math.round(v / step) * step)).toFixed(4)))
    .default(fallback)

const flag = (fallback: boolean) =>
  z
    .union([z.boolean(), z.enum(['1', '0', 'true', 'false'])])
    .transform(v => v === true || v === '1' || v === 'true')
    .catch(fallback)
    .default(fallback)

/** Every adjustable number, with its bounds. The UI reads the bounds from here too. */
export const ADVISOR_LIMITS = {
  weightExpired: { min: 0, max: 200, step: 5, default: 100 },
  weightMissing: { min: 0, max: 200, step: 5, default: 80 },
  weightExpiring: { min: 0, max: 200, step: 5, default: 50 },
  expiringRamp: { min: 0, max: 5, step: 0.5, default: 1 },
  waitPenalty: { min: 0, max: 3, step: 0.1, default: 0.5 },
  lateAfterExpiryPenalty: { min: 0, max: 200, step: 5, default: 40 },
  fillPreference: { min: -20, max: 20, step: 1, default: 10 },
  maxFill: { min: 50, max: 100, step: 5, default: 100 },
  horizonDays: { min: 14, max: 365, step: 7, default: 120 },
  maxPerEmployee: { min: 1, max: 5, step: 1, default: 2 },
} as const

export type AdvisorNumberSetting = keyof typeof ADVISOR_LIMITS

const numberField = (key: AdvisorNumberSetting) => {
  const l = ADVISOR_LIMITS[key]
  return bounded(l.min, l.max, l.default, l.step)
}

/** Parses (and clamps) settings from anything: a URL query, a form, a partial object. */
export const advisorSettingsSchema = z.object({
  weightExpired: numberField('weightExpired'),
  weightMissing: numberField('weightMissing'),
  weightExpiring: numberField('weightExpiring'),
  expiringRamp: numberField('expiringRamp'),
  waitPenalty: numberField('waitPenalty'),
  lateAfterExpiryPenalty: numberField('lateAfterExpiryPenalty'),
  fillPreference: numberField('fillPreference'),
  maxFill: numberField('maxFill'),
  horizonDays: numberField('horizonDays'),
  maxPerEmployee: numberField('maxPerEmployee'),
  includeExpiring: flag(true),
  includeParentalLeave: flag(false),
})
export type AdvisorSettings = z.output<typeof advisorSettingsSchema>

export const DEFAULT_ADVISOR_SETTINGS: AdvisorSettings = advisorSettingsSchema.parse({})

/** Only the values that differ from the defaults, as strings (for a shareable URL). */
export function settingsToQuery(settings: AdvisorSettings): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(DEFAULT_ADVISOR_SETTINGS) as (keyof AdvisorSettings)[]) {
    const value = settings[key]
    if (value !== DEFAULT_ADVISOR_SETTINGS[key])
      out[key] = typeof value === 'boolean' ? (value ? '1' : '0') : String(value)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Plan

export type ScoreTermKey = 'urgency' | 'expiryRamp' | 'wait' | 'lateAfterExpiry' | 'fill'
export interface ScoreTerm {
  key: ScoreTermKey
  value: number
}

export interface Suggestion {
  need: AdvisorNeed
  session: AdvisorSession
  /** Days from `asOf` to the session (Prague calendar days). */
  daysUntil: number
  /** Booked seats including this one, against capacity. */
  bookedAfter: number
  score: number
  /** Always sum to `score`. */
  terms: ScoreTerm[]
}

export type UnresolvedReason = 'NO_SESSION' | 'OUTSIDE_HORIZON' | 'NO_SEATS' | 'CONFLICT' | 'LIMIT'
export interface Unresolved {
  need: AdvisorNeed
  reason: UnresolvedReason
}

export interface SeatMove {
  to: AdvisorSession
  count: number
}
export interface OverbookedSession {
  session: AdvisorSession
  booked: number
  excess: number
  moves: SeatMove[]
  /** Seats still over capacity after the moves (no room elsewhere, or only named bookings). */
  remaining: number
}

export interface PlanMetrics {
  complianceBefore: number
  complianceAfter: number
  utilisationBefore: number
  utilisationAfter: number
  overbookedBefore: number
  overbookedAfter: number
  openBefore: number
  openAfter: number
  cost: number
}

export interface AdvisorPlan {
  suggestions: Suggestion[]
  unresolved: Unresolved[]
  /** Needs already met by a named booking on an upcoming session of the course. */
  covered: AdvisorNeed[]
  overbooked: OverbookedSession[]
  /** Per course: people the plan could not place, worst first (drives "add a session"). */
  shortfall: { courseCode: string; courseName: string; people: number }[]
  /** Per course with open needs: who needs it (by status) against the seats on offer. */
  demand: CourseDemand[]
  metrics: PlanMetrics
}

export interface CourseDemand {
  courseCode: string
  courseName: string
  needs: Record<NeedStatus, number>
  /** Seats left (under maxFill, within the horizon) before the plan, after overbooking moves. */
  freeSeats: number
  placed: number
}

const STATUS_RANK: Record<NeedStatus, number> = { EXPIRED: 0, MISSING: 1, EXPIRING: 2 }
const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true })

const sessionDay = (s: AdvisorSession) => toZonedParts(s.startsAt).date
const overlaps = (a: AdvisorSession, b: AdvisorSession) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)
const byStart = (a: AdvisorSession, b: AdvisorSession) =>
  Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.externalId.localeCompare(b.externalId)

function daysLeft(need: AdvisorNeed, asOf: IsoDate): number | null {
  return need.validUntil === null ? null : diffInDays(asOf, need.validUntil)
}

/** Base urgency of a need, as named terms. */
export function needPriority(
  need: AdvisorNeed,
  settings: AdvisorSettings,
  input: Pick<AdvisorInput, 'asOf' | 'expiringWithinDays'>
): ScoreTerm[] {
  const weight = {
    EXPIRED: settings.weightExpired,
    MISSING: settings.weightMissing,
    EXPIRING: settings.weightExpiring,
  }[need.status]
  const terms: ScoreTerm[] = [{ key: 'urgency', value: weight }]
  if (need.status === 'EXPIRING') {
    const left = Math.max(0, daysLeft(need, input.asOf) ?? input.expiringWithinDays)
    terms.push({
      key: 'expiryRamp',
      value: settings.expiringRamp * Math.max(0, input.expiringWithinDays - left),
    })
  }
  return terms
}

const sum = (terms: ScoreTerm[]) => terms.reduce((total, t) => total + t.value, 0)

export function planAssignments(input: AdvisorInput, settings: AdvisorSettings): AdvisorPlan {
  const { asOf } = input
  const upcoming = input.sessions
    .filter(s => s.status === 'PLANNED' && sessionDay(s) >= asOf)
    .toSorted(byStart)
  const booked = new Map(upcoming.map(s => [s.externalId, s.unnamedBookings + s.assigned.length]))
  const seatLimit = (s: AdvisorSession) => Math.floor((s.capacity * settings.maxFill) / 100)

  // 1. Overbooking first: moving anonymous seats out frees capacity the plan must not reuse.
  const overbooked: OverbookedSession[] = []
  for (const source of upcoming) {
    const before = booked.get(source.externalId) ?? 0
    const excess = before - source.capacity
    if (excess <= 0) continue
    let movable = Math.min(excess, source.unnamedBookings)
    const moves: SeatMove[] = []
    for (const target of upcoming) {
      if (movable === 0) break
      if (target === source || target.courseCode !== source.courseCode) continue
      const room = seatLimit(target) - (booked.get(target.externalId) ?? 0)
      if (room <= 0) continue
      const count = Math.min(room, movable)
      moves.push({ to: target, count })
      booked.set(target.externalId, (booked.get(target.externalId) ?? 0) + count)
      booked.set(source.externalId, (booked.get(source.externalId) ?? 0) - count)
      movable -= count
    }
    const moved = moves.reduce((n, m) => n + m.count, 0)
    overbooked.push({ session: source, booked: before, excess, moves, remaining: excess - moved })
  }

  const freeSeatsBefore = new Map<string, number>()
  for (const s of upcoming) {
    if (diffInDays(asOf, sessionDay(s)) > settings.horizonDays) continue
    const free = Math.max(0, seatLimit(s) - (booked.get(s.externalId) ?? 0))
    freeSeatsBefore.set(s.courseCode, (freeSeatsBefore.get(s.courseCode) ?? 0) + free)
  }

  // 2. Which needs are in play.
  const covered: AdvisorNeed[] = []
  const considered: AdvisorNeed[] = []
  for (const need of input.needs) {
    if (need.status === 'EXPIRING' && !settings.includeExpiring) continue
    if (need.employee.status === 'PARENTAL_LEAVE' && !settings.includeParentalLeave) continue
    const booking = upcoming.find(
      s => s.courseCode === need.course.code && s.assigned.includes(need.employee.externalId)
    )
    if (booking) covered.push(need)
    else considered.push(need)
  }

  // 3. Most urgent first, with a total, deterministic tie-break.
  const priority = new Map(considered.map(n => [n, needPriority(n, settings, input)]))
  const ordered = considered.toSorted((a, b) => {
    const pa = sum(priority.get(a) ?? [])
    const pb = sum(priority.get(b) ?? [])
    return (
      pb - pa ||
      STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
      (daysLeft(a, asOf) ?? Infinity) - (daysLeft(b, asOf) ?? Infinity) ||
      compareNullable(a.employee.department, b.employee.department) ||
      collator.compare(a.employee.name, b.employee.name) ||
      a.employee.externalId.localeCompare(b.employee.externalId) ||
      a.course.code.localeCompare(b.course.code)
    )
  })

  // Each person's sessions so far (named bookings, then planned ones), for clash checks.
  const busy = new Map<string, AdvisorSession[]>()
  for (const s of upcoming) for (const id of s.assigned) busy.set(id, [...(busy.get(id) ?? []), s])
  const plannedCount = new Map<string, number>()

  const suggestions: Suggestion[] = []
  const unresolved: Unresolved[] = []
  for (const need of ordered) {
    const person = need.employee.externalId
    const ofCourse = upcoming.filter(s => s.courseCode === need.course.code)
    const inHorizon = ofCourse.filter(s => diffInDays(asOf, sessionDay(s)) <= settings.horizonDays)
    if (inHorizon.length === 0) {
      unresolved.push({ need, reason: ofCourse.length === 0 ? 'NO_SESSION' : 'OUTSIDE_HORIZON' })
      continue
    }
    if ((plannedCount.get(person) ?? 0) >= settings.maxPerEmployee) {
      unresolved.push({ need, reason: 'LIMIT' })
      continue
    }
    const withSeats = inHorizon.filter(s => (booked.get(s.externalId) ?? 0) < seatLimit(s))
    if (withSeats.length === 0) {
      unresolved.push({ need, reason: 'NO_SEATS' })
      continue
    }
    const free = withSeats.filter(s => !(busy.get(person) ?? []).some(b => overlaps(b, s)))
    if (free.length === 0) {
      unresolved.push({ need, reason: 'CONFLICT' })
      continue
    }

    let best: Suggestion | null = null
    for (const session of free) {
      const daysUntil = diffInDays(asOf, sessionDay(session))
      const bookedAfter = (booked.get(session.externalId) ?? 0) + 1
      const terms: ScoreTerm[] = [
        ...(priority.get(need) ?? []),
        { key: 'wait', value: -settings.waitPenalty * daysUntil },
      ]
      if (
        need.status === 'EXPIRING' &&
        need.validUntil !== null &&
        sessionDay(session) > need.validUntil
      )
        terms.push({ key: 'lateAfterExpiry', value: -settings.lateAfterExpiryPenalty })
      if (session.capacity > 0)
        terms.push({
          key: 'fill',
          value: settings.fillPreference * (bookedAfter / session.capacity),
        })
      const candidate: Suggestion = {
        need,
        session,
        daysUntil,
        bookedAfter,
        score: sum(terms),
        terms,
      }
      // Strictly better only: sessions are in start order, so ties keep the earlier one.
      if (best === null || candidate.score > best.score + 1e-9) best = candidate
    }
    if (best === null) continue
    suggestions.push(best)
    booked.set(best.session.externalId, best.bookedAfter)
    busy.set(person, [...(busy.get(person) ?? []), best.session])
    plannedCount.set(person, (plannedCount.get(person) ?? 0) + 1)
  }

  return {
    suggestions,
    unresolved,
    covered,
    overbooked,
    shortfall: shortfallByCourse(unresolved),
    demand: demandByCourse(considered, suggestions, freeSeatsBefore),
    metrics: metrics(input, upcoming, booked, overbooked, considered, suggestions, unresolved),
  }
}

function compareNullable(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return collator.compare(a, b)
}

function demandByCourse(
  considered: AdvisorNeed[],
  suggestions: Suggestion[],
  freeSeats: Map<string, number>
): CourseDemand[] {
  const byCourse = new Map<string, CourseDemand>()
  for (const need of considered) {
    const entry = byCourse.get(need.course.code) ?? {
      courseCode: need.course.code,
      courseName: need.course.name,
      needs: { EXPIRED: 0, MISSING: 0, EXPIRING: 0 },
      freeSeats: freeSeats.get(need.course.code) ?? 0,
      placed: 0,
    }
    entry.needs[need.status] += 1
    byCourse.set(need.course.code, entry)
  }
  for (const s of suggestions) {
    const entry = byCourse.get(s.need.course.code)
    if (entry) entry.placed += 1
  }
  const total = (d: CourseDemand) => d.needs.EXPIRED + d.needs.MISSING + d.needs.EXPIRING
  return [...byCourse.values()].sort(
    (a, b) => total(b) - total(a) || a.courseCode.localeCompare(b.courseCode)
  )
}

function shortfallByCourse(unresolved: Unresolved[]): AdvisorPlan['shortfall'] {
  const byCourse = new Map<string, { courseCode: string; courseName: string; people: number }>()
  for (const { need, reason } of unresolved) {
    if (reason === 'CONFLICT' || reason === 'LIMIT') continue
    const entry = byCourse.get(need.course.code) ?? {
      courseCode: need.course.code,
      courseName: need.course.name,
      people: 0,
    }
    entry.people += 1
    byCourse.set(need.course.code, entry)
  }
  return [...byCourse.values()].sort(
    (a, b) => b.people - a.people || a.courseCode.localeCompare(b.courseCode)
  )
}

function metrics(
  input: AdvisorInput,
  upcoming: AdvisorSession[],
  bookedAfter: Map<string, number>,
  overbooked: OverbookedSession[],
  considered: AdvisorNeed[],
  suggestions: Suggestion[],
  unresolved: Unresolved[]
): PlanMetrics {
  const { activeCounts } = input
  const heldBefore = activeCounts.VALID + activeCounts.EXPIRING
  // Training an expired or missing person makes the pair held; expiring ones already count.
  const gained = suggestions.filter(
    s => s.need.employee.status === 'ACTIVE' && s.need.status !== 'EXPIRING'
  ).length
  const rate = (held: number) => (activeCounts.total === 0 ? 1 : held / activeCounts.total)

  const capacity = upcoming.reduce((n, s) => n + s.capacity, 0)
  const filled = (seats: (s: AdvisorSession) => number) =>
    capacity === 0 ? 0 : upcoming.reduce((n, s) => n + Math.min(seats(s), s.capacity), 0) / capacity

  return {
    complianceBefore: rate(heldBefore),
    complianceAfter: rate(heldBefore + gained),
    utilisationBefore: filled(s => s.unnamedBookings + s.assigned.length),
    utilisationAfter: filled(s => bookedAfter.get(s.externalId) ?? 0),
    overbookedBefore: overbooked.length,
    overbookedAfter: overbooked.filter(o => o.remaining > 0).length,
    openBefore: considered.length,
    openAfter: unresolved.length,
    cost: suggestions.reduce((n, s) => n + (s.session.pricePerPerson ?? 0), 0),
  }
}
