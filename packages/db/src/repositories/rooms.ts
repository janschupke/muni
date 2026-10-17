import type { Capability, RoomKind } from '@muni/domain/enums'
import { type RoomFit, roomFit, UTILISATION_DAYS, WORKING_HOURS } from '@muni/domain/rooms'
import {
  addDays,
  type IsoDate,
  isWorkingDay,
  todayIn,
  toZonedParts,
  zonedTimeToUtc,
} from '@muni/utils/dates'

import { ACTIVE } from './archive'
import { dbOf, type RepoOptions } from './context'
import type { SessionListItem } from './courses'
import { needsOf, needsSelect } from './session-fit'
import { listSessions, upcomingSessionWhere } from './sessions'

export interface RoomListItem {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
  capabilities: Capability[]
  upcomingSessions: number
  /**
   * Booked hours ÷ working hours over the UTILISATION_DAYS from tomorrow: Czech working
   * days of WORKING_HOURS each, sessions on other days not counted. Null for online rooms.
   */
  utilisation: number | null
}

export interface RoomDetail extends RoomListItem {
  note: string | null
  /** Planned sessions still ahead (cancelled ones free the room, so they are not listed). */
  upcoming: SessionListItem[]
  /** Sessions held here (cancelled ones not counted). */
  pastCount: number
  /** Every course, with what a session of it needs beside what this room provides. */
  courses: { code: string; name: string; fit: RoomFit }[]
}

/** The days utilisation is measured over, and their bounds as instants. */
function utilisationWindow(now: Date) {
  const first = addDays(todayIn(undefined, now), 1)
  const days: IsoDate[] = Array.from({ length: UTILISATION_DAYS }, (_, i) => addDays(first, i))
  return {
    from: zonedTimeToUtc(first, '00:00'),
    until: zonedTimeToUtc(addDays(first, UTILISATION_DAYS), '00:00'),
    workingHours: days.filter(isWorkingDay).length * WORKING_HOURS,
  }
}

type Window = ReturnType<typeof utilisationWindow>

/** Hours booked within the window, on working days only (a session never spans midnight). */
function bookedHours(sessions: { startsAt: Date; endsAt: Date }[], window: Window): number {
  let hours = 0
  for (const s of sessions) {
    const start = Math.max(s.startsAt.getTime(), window.from.getTime())
    const end = Math.min(s.endsAt.getTime(), window.until.getTime())
    if (end > start && isWorkingDay(toZonedParts(new Date(start)).date))
      hours += (end - start) / 3_600_000
  }
  return hours
}

/** A room's list facts: everything is read for these rooms in one query. */
function roomQuery(now: Date, window: Window) {
  return {
    id: true,
    name: true,
    kind: true,
    capacity: true,
    note: true,
    capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
    _count: { select: { sessions: { where: upcomingSessionWhere(now) } } },
    sessions: {
      where: {
        ...ACTIVE,
        status: 'PLANNED',
        startsAt: { lt: window.until },
        endsAt: { gt: window.from },
      },
      select: { startsAt: true, endsAt: true },
    },
  } as const
}

interface RoomRow {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
  capabilities: { capability: Capability }[]
  _count: { sessions: number }
  sessions: { startsAt: Date; endsAt: Date }[]
}

function toListItem(room: RoomRow, window: Window): RoomListItem {
  return {
    id: room.id,
    name: room.name,
    kind: room.kind,
    capacity: room.capacity,
    capabilities: room.capabilities.map(c => c.capability),
    upcomingSessions: room._count.sessions,
    utilisation:
      room.kind === 'ONLINE' ? null : bookedHours(room.sessions, window) / window.workingHours,
  }
}

export async function listRooms(options?: RepoOptions & { now?: Date }): Promise<RoomListItem[]> {
  const now = options?.now ?? new Date()
  const window = utilisationWindow(now)
  const rooms = await dbOf(options).room.findMany({
    where: ACTIVE,
    select: roomQuery(now, window),
    orderBy: { name: 'asc' },
  })
  return rooms.map(room => toListItem(room, window))
}

export async function getRoom(
  id: string,
  options?: RepoOptions & { now?: Date }
): Promise<RoomDetail | null> {
  const db = dbOf(options)
  const now = options?.now ?? new Date()
  const window = utilisationWindow(now)
  const [room, upcoming, pastCount, courses] = await Promise.all([
    db.room.findFirst({ where: { id, ...ACTIVE }, select: roomQuery(now, window) }),
    listSessions({ window: 'upcoming', room: id, status: 'PLANNED' }, { ...options, now }),
    db.courseSession.count({
      where: { ...ACTIVE, roomId: id, status: 'PLANNED', endsAt: { lt: now } },
    }),
    db.course.findMany({
      where: ACTIVE,
      select: {
        code: true,
        name: true,
        ...needsSelect,
      },
      orderBy: { code: 'asc' },
    }),
  ])
  if (!room) return null
  const listed = toListItem(room, window)
  return {
    ...listed,
    note: room.note,
    upcoming,
    pastCount,
    courses: courses.map(c => {
      const needs = needsOf(c)
      return { code: c.code, name: c.name, fit: roomFit(listed, needs, needs.groupSize) }
    }),
  }
}

export async function getRoomForEdit(id: string, options?: RepoOptions) {
  const room = await dbOf(options).room.findFirst({
    where: { id, ...ACTIVE },
    select: {
      id: true,
      name: true,
      kind: true,
      capacity: true,
      note: true,
      capabilities: { select: { capability: true }, orderBy: { capability: 'asc' } },
    },
  })
  return room && { ...room, capabilities: room.capabilities.map(c => c.capability) }
}
