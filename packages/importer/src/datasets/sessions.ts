import type { SessionStatus } from '@muni/domain/enums'
import { sessionSchema, type SessionInput } from '@muni/domain/schemas'
import { parseTimeRange } from '@muni/utils/dates'
import { fold } from '@muni/utils/text'

import { reservedId, type RowBuilder } from '../fields'
import type { RowMapResult } from '../types'

const STATUS_BY_FOLD: Record<string, SessionStatus> = {
  planovano: 'PLANNED',
  planned: 'PLANNED',
  zruseno: 'CANCELLED',
  cancelled: 'CANCELLED',
  canceled: 'CANCELLED',
}

function status(b: RowBuilder): SessionStatus | null {
  const raw = b.cell('status')
  if (raw === '') return 'PLANNED'
  return STATUS_BY_FOLD[fold(raw)] ?? b.error('status', 'INVALID_STATUS', { raw })
}

export function mapSession(b: RowBuilder): RowMapResult<SessionInput> {
  if (b.isSummaryRow('externalId')) return b.rejectSummary()

  const externalId = reservedId(b, b.required('externalId')?.toUpperCase() ?? null, 'session')
  const courseCode = b.code('courseCode')
  const date = b.date('date', { required: true })

  const rawTime = b.required('time')
  const time = rawTime === null ? null : parseTimeRange(rawTime)
  if (rawTime !== null && time === null) b.error('time', 'INVALID_TIME', { raw: rawTime })

  const location = b.text('location')
  if (location === null) b.error('location', 'REQUIRED')

  const capacity = b.count('capacity', { required: true })
  const bookedCount = b.count('bookedCount', { required: false }) ?? 0
  if (capacity === 0) b.warn('capacity', 'ZERO_CAPACITY')
  if (capacity !== null && capacity > 0 && bookedCount > capacity) {
    b.warn('bookedCount', 'OVERBOOKED', { booked: bookedCount, capacity })
  }

  return b.finish(sessionSchema, {
    externalId,
    courseCode,
    date,
    startTime: time?.start ?? null,
    endTime: time?.end ?? null,
    location,
    capacity,
    bookedCount,
    pricePerPerson: b.price('price'),
    status: status(b),
  })
}
