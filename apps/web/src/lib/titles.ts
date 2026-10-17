import { toZonedParts } from '@muni/utils/dates'
import { formatDate } from '@muni/utils/format'

/** A session as its tab names it: the course and the day ("Požární ochrana · 4. 11. 2026"). */
export const sessionTitle = (
  session: { courseName: string; startsAt: string },
  locale: string
): string => `${session.courseName} · ${formatDate(toZonedParts(session.startsAt).date, locale)}`
