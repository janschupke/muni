import { type RoomFacts, roomKindOfName, roomMismatch } from '@muni/domain/rooms'
import type { CompletionInput, RoomInput, SessionInput } from '@muni/domain/schemas'
import { intervalsOverlap } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { isCommitted } from '../row-state'
import type { ParsedRow, ReferenceSnapshot } from '../types'
import { Canonicalizer } from './canonical'
import {
  type Archived,
  archivedIssue,
  checkRef,
  duplicateId,
  duplicateOf,
  type Extra,
  finalize,
  firstRowByKey,
  issue,
  normalized,
  usable,
} from './shared'

/** Whether two sessions on the same day overlap (wall-clock `HH:mm`). */
const overlaps = (
  a: { date: string; startTime: string; endTime: string },
  b: { date: string; startTime: string; endTime: string }
) =>
  a.date === b.date &&
  intervalsOverlap({ start: a.startTime, end: a.endTime }, { start: b.startTime, end: b.endTime })

/**
 * Who holds each session: the provider it names, which must offer the course (as the register
 * says, or as this batch's completions will make it: a provider that delivered a course offers
 * it); else the default provider, which is given the course where it lacks it. Completions
 * commit before sessions, so only the ones that will be written count.
 */
function providerCheck(
  rows: ParsedRow<SessionInput>[],
  completions: readonly ParsedRow<CompletionInput>[],
  reference: ReferenceSnapshot
) {
  const deliveries = completions
    .filter(isCommitted)
    .flatMap(r =>
      r.data.provider ? [{ provider: fold(r.data.provider), course: r.data.courseCode }] : []
    )
  const known = new Set([...reference.providers.map(fold), ...deliveries.map(d => d.provider)])
  const offers = new Set([
    ...reference.courses.flatMap(c => (c.offeredBy ?? []).map(p => `${fold(p)}|${c.code}`)),
    ...deliveries.map(d => `${d.provider}|${d.course}`),
  ])
  // A completions file makes providers, and a default, when the register has none.
  const fallback = reference.defaultProvider ?? null
  const hasDefault = fallback !== null || deliveries.length > 0
  const firstWithoutOffer = firstRowByKey(
    rows.filter(r => usable(r) && r.base.data.providerName === null),
    d => d.courseCode
  )
  return (extra: Extra, row: ParsedRow<SessionInput>, data: SessionInput) => {
    if (data.providerName !== null) {
      const name = fold(data.providerName)
      if (!known.has(name))
        extra.push(issue('provider', 'PROVIDER_UNKNOWN', 'error', { value: data.providerName }))
      else if (!offers.has(`${name}|${data.courseCode}`))
        extra.push(
          issue('provider', 'PROVIDER_NOT_OFFERING', 'error', {
            value: data.providerName,
            course: data.courseCode,
          })
        )
      return
    }
    if (!hasDefault) {
      extra.push(issue('provider', 'NO_DEFAULT_PROVIDER', 'error'))
      return
    }
    // The default is given the course once, on the first row that needs it.
    if (
      fallback !== null &&
      !offers.has(`${fold(fallback)}|${data.courseCode}`) &&
      firstWithoutOffer.get(data.courseCode) === row
    )
      extra.push(
        issue('provider', 'OFFERING_ADDED', 'warning', { value: fallback, course: data.courseCode })
      )
  }
}

/**
 * Where each session is held: its place resolves to a room in this batch or the register
 * (spelling variants join), else the room is created from the sessions held there. A planned
 * session is checked as the session form checks it: a room too small, lacking what the course
 * needs, or taken then by another planned session (an online room never is).
 */
function roomCheck(
  rows: ParsedRow<SessionInput>[],
  roomRows: readonly ParsedRow<RoomInput>[],
  reference: ReferenceSnapshot,
  archived: Archived
) {
  const roomNames = roomRows.filter(isCommitted).map(r => r.data.name)
  const known = new Canonicalizer(roomNames, reference.rooms)
  const rooms = new Canonicalizer(
    rows.filter(usable).map(r => r.base.data.location),
    [...roomNames, ...reference.rooms]
  )
  // The first session held in an unknown room says it will be created; the rest just use it.
  const firstInRoom = firstRowByKey(rows, d => rooms.keyOf(d.location))
  // What each room offers: the rooms file wins over the register; a room neither knows is
  // created from its sessions, so it fits them.
  const facts = new Map<string, Omit<RoomFacts, 'id'>>(
    (reference.roomFacts ?? []).map(r => [rooms.keyOf(r.name), r])
  )
  for (const row of roomRows.filter(isCommitted)) {
    const key = rooms.keyOf(row.data.name)
    facts.set(key, {
      ...row.data,
      capabilities: row.data.capabilities ?? facts.get(key)?.capabilities ?? [],
    })
  }
  const needsByCourse = new Map(
    reference.courses.flatMap(c => (c.needs ? [[c.code, c.needs]] : []))
  )
  // Planned sessions that hold a room: the register's (unless this batch replaces them) and
  // the batch's own, in file order.
  const batchIds = new Set(rows.filter(usable).map(r => r.base.data.externalId))
  const held = (reference.plannedSessions ?? [])
    .filter(s => !batchIds.has(s.externalId))
    .map(s => ({ ...s, key: rooms.keyOf(s.room) }))

  return (
    extra: Extra,
    row: ParsedRow<SessionInput>,
    data: SessionInput,
    { checkFit, slotTaken }: { checkFit: boolean; slotTaken: boolean }
  ): string => {
    const location = rooms.canonical(data.location)
    const key = rooms.keyOf(data.location)
    const room = facts.get(key)
    if (checkFit && data.status === 'PLANNED') {
      if (room && room.kind !== 'ONLINE' && room.capacity !== null && room.capacity < data.capacity)
        extra.push(
          issue('capacity', 'ROOM_TOO_SMALL', 'warning', {
            value: data.capacity,
            capacity: room.capacity,
          })
        )
      const needs = needsByCourse.get(data.courseCode)
      if (room && needs && roomMismatch({ ...room, id: '' }, needs, null))
        extra.push(issue('location', 'ROOM_UNSUITABLE', 'warning', { value: location }))
      // An online room is never taken; a room only the sessions name is online by its name.
      if ((room?.kind ?? roomKindOfName(location)) !== 'ONLINE' && !slotTaken) {
        const clash = held.find(h => h.key === key && overlaps(h, data))
        if (clash)
          extra.push(issue('location', 'ROOM_BUSY', 'warning', { otherId: clash.externalId }))
        held.push({ ...data, room: location, key })
      }
    }
    if (archived.room(data.location)) {
      extra.push(archivedIssue('location', data.location))
    } else if (!known.has(data.location)) {
      if (firstInRoom.get(key) === row)
        extra.push(issue('location', 'ROOM_DERIVED', 'warning', { value: location }))
    } else {
      normalized(extra, 'location', data.location, location)
    }
    return location
  }
}

/**
 * Sessions: one row per ID, of a course the register or the import has, held by a provider
 * that offers it (`providerCheck`) in a room that suits it (`roomCheck`). The same course at
 * the same time and place twice is a warning.
 */
export function validateSessions(
  rows: ParsedRow<SessionInput>[],
  {
    archived,
    reference,
    validity,
    rooms,
    completions,
  }: {
    archived: Archived
    reference: ReferenceSnapshot
    /** The courses sessions may name, by code. */
    validity: ReadonlyMap<string, number | null>
    rooms: readonly ParsedRow<RoomInput>[]
    completions: readonly ParsedRow<CompletionInput>[]
  }
): ParsedRow<SessionInput>[] {
  const first = firstRowByKey(rows, d => d.externalId)
  const slotOf = (d: SessionInput) => `${d.courseCode}|${d.date}|${d.startTime}|${fold(d.location)}`
  const firstSlot = firstRowByKey(rows, slotOf)
  const checkProvider = providerCheck(rows, completions, reference)
  const checkRoom = roomCheck(rows, rooms, reference, archived)
  return rows.map(row => {
    const extra: Extra = []
    if (!usable(row)) return finalize(row, null, extra)
    const data = row.base.data
    const owner = duplicateId(extra, 'externalId', row, first, data.externalId)
    if (archived.session(data.externalId)) extra.push(archivedIssue('externalId', data.externalId))
    checkRef(extra, 'courseCode', data.courseCode, {
      archived: archived.course(data.courseCode),
      known: validity.has(data.courseCode),
      unknown: ['COURSE_NOT_FOUND', 'error'],
    })
    const slotTwin = duplicateOf(row, firstSlot, slotOf(data))
    if (!owner && slotTwin?.base.data)
      extra.push(
        issue('date', 'DUPLICATE_SLOT', 'warning', { otherId: slotTwin.base.data.externalId })
      )
    checkProvider(extra, row, data)
    const location = checkRoom(extra, row, data, { checkFit: !owner, slotTaken: !!slotTwin })
    return finalize<SessionInput>(row, { ...data, location }, extra)
  })
}
