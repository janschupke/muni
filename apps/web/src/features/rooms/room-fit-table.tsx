import type { RoomDetail } from '@muni/db/repositories'
import type { RoomMismatch } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger } from '@muni/utils/format'
import { CircleCheck, CircleX } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

import { Link } from '@/components/navigation/link'
import { CapabilityFitList } from '@/features/rooms/room-badges'
import { ScheduleSessionButton } from '@/features/sessions/schedule-button'

/**
 * Every course beside this room: what a session of it needs next to what the room provides,
 * then whether it fits and, when not, the first reason in numbers. An online room is judged
 * only on whether the course may be held online, which the verdict says: it has no seats or
 * equipment to set beside the needs. Admins schedule a session of a course here from its row.
 */
export function RoomFitTable({
  room,
  canEdit = false,
}: {
  room: Pick<RoomDetail, 'id' | 'name' | 'kind' | 'courses'>
  /** Admins schedule a session of a course here, from its row. */
  canEdit?: boolean | undefined
}) {
  const t = useTranslations('rooms.detail.fit')
  const ts = useTranslations('sessions.schedule')
  const online = room.kind === 'ONLINE'
  return (
    <TableContainer paging="one row per course: bounded by the catalogue">
      <Table aria-label={t('label', { name: room.name })}>
        <THead>
          <tr>
            <Th>{t('course')}</Th>
            {!online && (
              <>
                <Th align="right">{t('seatsNeeded')}</Th>
                <Th align="right">{t('seatsHere')}</Th>
                <Th>{t('equipment')}</Th>
              </>
            )}
            <Th>{t('verdict')}</Th>
            {canEdit && (
              <Th className="w-0">
                <span className="sr-only">{ts('action')}</span>
              </Th>
            )}
          </tr>
        </THead>
        <TBody>
          {room.courses.map(c => (
            <Tr key={c.code}>
              <Td>
                <TextLink asChild emphasis>
                  <Link href={`/courses/${c.code}`}>{c.name}</Link>
                </TextLink>
              </Td>
              {!c.fit.online && (
                <>
                  <Td align="right">
                    <Seats value={c.fit.seats.needed} empty={t('splitByRoom')} />
                  </Td>
                  <Td
                    align="right"
                    className={c.fit.seats.ok ? undefined : 'font-medium text-danger-fg'}
                  >
                    <Seats value={c.fit.seats.provided} empty={t('unlimited')} />
                  </Td>
                  <Td>
                    <CapabilityFitList
                      needed={c.fit.equipment.needed}
                      missing={c.fit.equipment.missing}
                      empty={t('noEquipment')}
                    />
                  </Td>
                </>
              )}
              <Td>
                <Verdict mismatch={c.fit.mismatch} />
              </Td>
              {canEdit && (
                <Td align="right" nowrap>
                  <ScheduleSessionButton
                    course={c.code}
                    room={room.id}
                    block={c.block}
                    label={ts('actionIn', { course: c.name, room: room.name })}
                  />
                </Td>
              )}
            </Tr>
          ))}
        </TBody>
      </Table>
    </TableContainer>
  )
}

function Seats({ value, empty }: { value: number | null; empty: string }) {
  const locale = useLocale()
  return value === null ? (
    <span className="text-fg-subtle">{empty}</span>
  ) : (
    formatInteger(value, locale)
  )
}

function Verdict({ mismatch }: { mismatch: RoomMismatch | null }) {
  const t = useTranslations('rooms.detail.fit')
  const tcap = useTranslations('status.capability')
  if (mismatch === null)
    return (
      <Badge tone="success">
        <CircleCheck aria-hidden />
        {t('fits')}
      </Badge>
    )
  let reason: string
  switch (mismatch.kind) {
    case 'TOO_SMALL':
      reason = t('TOO_SMALL', { needed: mismatch.needed, capacity: mismatch.capacity })
      break
    case 'MISSING_CAPABILITIES':
      reason = t('MISSING_CAPABILITIES', { missing: mismatch.missing.map(m => tcap(m)).join(', ') })
      break
    case 'ONLINE_NOT_ALLOWED':
      reason = t('ONLINE_NOT_ALLOWED')
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-muted">
      <CircleX aria-hidden className="size-4 flex-none text-danger-fg" />
      {reason}
    </span>
  )
}
