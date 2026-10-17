import { roomKindOfName } from '@muni/domain/rooms'
import { APP_ID_PREFIX, type SessionInput } from '@muni/domain/schemas'
import { zonedTimeToUtc } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import type { Tx } from '../client'
import { ACTIVE } from '../repositories/archive'
import { lockSessionWrites } from '../repositories/session-fit'
import type { CommitResult } from './shared'
import {
  archivedOnly,
  CommitRefusedError,
  courseIds,
  lookup,
  partition,
  withoutArchived,
} from './shared'

/**
 * The room of each session, by name. A place no rooms file listed becomes a room of the kind
 * its name implies (see roomKindOfName), seating the largest session held there in this
 * chunk; an online room has no seat limit.
 */
async function resolveRooms(tx: Tx, records: SessionInput[]): Promise<Map<string, string>> {
  const names = [...new Set(records.map(r => r.location))]
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('names:room'))`
  const existing = await tx.room.findMany({ where: ACTIVE, select: { id: true, name: true } })
  const byKey = new Map(existing.map(r => [fold(r.name), r.id]))
  const ids = new Map<string, string>()
  for (const name of names) {
    const known = byKey.get(fold(name))
    if (known !== undefined) {
      ids.set(name, known)
      continue
    }
    const kind = roomKindOfName(name)
    const held = records.filter(r => fold(r.location) === fold(name))
    const room = await tx.room.create({
      data: {
        name,
        kind,
        capacity: kind === 'ONLINE' ? null : Math.max(1, ...held.map(r => r.capacity)),
      },
      select: { id: true },
    })
    byKey.set(fold(name), room.id)
    ids.set(name, room.id)
  }
  return ids
}

/**
 * Derives what a session of each course needs from all its planned sessions so far: the
 * usual length, the median group size, online if ever held online. Every sessions import
 * derives them again, so they follow the history; what the app set is kept apart as
 * overrides (which win) and is never touched here.
 */
async function deriveSessionNeeds(tx: Tx, courseIdList: string[]): Promise<void> {
  const courses = await tx.course.findMany({
    where: { id: { in: courseIdList } },
    select: {
      id: true,
      sessions: {
        where: { ...ACTIVE, status: 'PLANNED', capacity: { gt: 0 } },
        select: { startsAt: true, endsAt: true, capacity: true, room: { select: { kind: true } } },
      },
    },
  })
  for (const course of courses) {
    if (course.sessions.length === 0) continue
    const minutes = course.sessions.map(s =>
      Math.round((s.endsAt.getTime() - s.startsAt.getTime()) / 60_000)
    )
    const sizes = course.sessions.map(s => s.capacity).sort((a, b) => a - b)
    await tx.course.update({
      where: { id: course.id },
      data: {
        sessionMinutes: mostCommon(minutes),
        groupSize: sizes[Math.floor((sizes.length - 1) / 2)] ?? null,
        onlineAllowed: course.sessions.some(s => s.room.kind === 'ONLINE'),
      },
    })
  }
}

/** The most frequent value; the smallest one on a tie. */
function mostCommon(values: number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0
}

/**
 * Refuses a planned session in a room that a session planned in the app (an S… ID) holds at
 * the same time. Clashes between imported sessions are the source system's to keep.
 */
async function refuseAppRoomClashes(
  tx: Tx,
  all: SessionInput[],
  records: SessionInput[],
  rooms: Map<string, string>
): Promise<void> {
  const planned = records.filter(r => r.status === 'PLANNED')
  if (planned.length === 0) return
  const held = await tx.courseSession.findMany({
    where: {
      ...ACTIVE,
      status: 'PLANNED',
      externalId: { startsWith: APP_ID_PREFIX.session },
      roomId: { in: [...new Set(planned.map(r => lookup(rooms, r.location, 'room')))] },
      room: { kind: { not: 'ONLINE' } },
    },
    select: { externalId: true, roomId: true, startsAt: true, endsAt: true },
  })
  for (const record of planned) {
    const roomId = lookup(rooms, record.location, 'room')
    const startsAt = zonedTimeToUtc(record.date, record.startTime)
    const endsAt = zonedTimeToUtc(record.date, record.endTime)
    const clash = held.find(s => s.roomId === roomId && s.startsAt < endsAt && s.endsAt > startsAt)
    if (clash)
      throw new CommitRefusedError(
        all.indexOf(record),
        'ROOM_BUSY',
        `${record.externalId} → ${clash.externalId}`
      )
  }
}

export async function writeSessions(tx: Tx, all: SessionInput[]): Promise<CommitResult> {
  const { kept: records, skipped } = withoutArchived(all, [
    [
      await archivedOnly(
        tx,
        'courseSession',
        'externalId',
        all.map(r => r.externalId)
      ),
      r => [r.externalId],
    ],
    [
      await archivedOnly(
        tx,
        'course',
        'code',
        all.map(r => r.courseCode)
      ),
      r => [r.courseCode],
    ],
    [
      await archivedOnly(
        tx,
        'room',
        'name',
        all.map(r => r.location)
      ),
      r => [r.location],
    ],
  ])
  // Session writes take turns, as the app's own do (see lockSessionWrites).
  await lockSessionWrites(tx)
  const courses = await courseIds(
    tx,
    records.map(r => r.courseCode)
  )
  const rooms = await resolveRooms(tx, records)
  await refuseAppRoomClashes(tx, all, records, rooms)
  // The export's booked count is the session's total. Named bookings (assignments) are part of
  // it, so only the remainder is stored as unnamed seats; a total below the named count keeps
  // the named bookings and stores no unnamed ones.
  const toData = (r: SessionInput, assigned: number) => ({
    courseId: lookup(courses, r.courseCode, 'course'),
    startsAt: zonedTimeToUtc(r.date, r.startTime),
    endsAt: zonedTimeToUtc(r.date, r.endTime),
    roomId: lookup(rooms, r.location, 'room'),
    capacity: r.capacity,
    unnamedBookings: Math.max(0, r.bookedCount - assigned),
    pricePerPerson: r.pricePerPerson,
    status: r.status,
  })
  const assignedBySession = new Map<string, number>()
  const { fresh, existing } = await partition(
    records,
    r => r.externalId,
    async keys => {
      // Locked before the named bookings are counted, as booking locks the session: one
      // booked meanwhile is counted, not stored again as an unnamed seat.
      const found = await tx.$queryRaw<{ id: string; external_id: string }[]>`
        SELECT id, external_id FROM course_sessions
        WHERE external_id = ANY(${keys}) AND archived_at IS NULL
        ORDER BY id FOR UPDATE`
      const counts = await tx.sessionAssignment.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: found.map(f => f.id) } },
        _count: { _all: true },
      })
      for (const c of counts) assignedBySession.set(c.sessionId, c._count._all)
      return found.map(f => ({ key: f.external_id, id: f.id }))
    }
  )
  await tx.courseSession.createMany({
    data: fresh.map(r => ({ externalId: r.externalId, ...toData(r, 0) })),
  })
  for (const { record, id } of existing)
    await tx.courseSession.update({
      where: { id },
      data: toData(record, assignedBySession.get(id) ?? 0),
    })
  await deriveSessionNeeds(tx, [...courses.values()])
  return { created: fresh.length, updated: existing.length, skipped }
}
