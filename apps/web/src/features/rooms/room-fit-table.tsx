import type { RoomDetail } from '@muni/db/repositories'
import type { RoomMismatch } from '@muni/domain/rooms'
import { Badge } from '@muni/ui/badge'
import { Table, TableContainer, TBody, Td, Th, THead } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger } from '@muni/utils/format'
import { CircleCheck, CircleX } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { CapabilityFitList } from '@/components/room-badges'

/**
 * Every course beside this room: what a session of it needs next to what the room provides,
 * then whether it fits and, when not, the first reason in numbers. An online room is judged
 * only on whether the course may be held online, so it shows that instead of seats and
 * equipment.
 */
export function RoomFitTable({ room }: { room: Pick<RoomDetail, 'name' | 'kind' | 'courses'> }) {
  const t = useTranslations('rooms.detail.fit')
  const online = room.kind === 'ONLINE'
  return (
    <TableContainer>
      <Table aria-label={t('label', { name: room.name })}>
        <THead>
          <tr>
            <Th>{t('course')}</Th>
            {online ? (
              <Th>{t('online')}</Th>
            ) : (
              <>
                <Th align="right">{t('seatsNeeded')}</Th>
                <Th align="right">{t('seatsHere')}</Th>
                <Th>{t('equipment')}</Th>
              </>
            )}
            <Th>{t('verdict')}</Th>
          </tr>
        </THead>
        <TBody>
          {room.courses.map(c => (
            <tr key={c.code}>
              <Td>
                <TextLink asChild emphasis>
                  <Link href={`/courses/${c.code}`}>{c.name}</Link>
                </TextLink>
              </Td>
              {c.fit.online ? (
                <Td>{c.fit.allowed ? t('allowed') : t('notAllowed')}</Td>
              ) : (
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
            </tr>
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
