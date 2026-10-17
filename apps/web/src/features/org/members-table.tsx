import type { EmployeeListItem } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { Meter } from '@muni/ui/meter'
import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDateTime, formatInteger, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { OrgLink } from '@/components/org-links'
import { ComplianceBadge, EmploymentBadge, rateTone } from '@/components/status-badges'

/**
 * A department's or position's people, one record each: where else they sit, their
 * employment, how much of what they must hold they hold, and every training that needs
 * attention (expired, missing or expiring) with its booking, if any.
 */
export function MembersTable({
  name,
  members,
  other,
}: {
  /** The group's name, for the table's accessible name. */
  name: string
  members: EmployeeListItem[]
  /** The other side of each person's place: positions in a department, and the reverse. */
  other: 'department' | 'position'
}) {
  const t = useTranslations('org.members')
  const locale = useLocale()
  if (members.length === 0) return <p className="text-sm text-fg-muted">{t('none')}</p>
  return (
    <Table density="compact" aria-label={t('label', { name })}>
      <THead className="bg-transparent">
        <tr>
          <Th>{t('person')}</Th>
          <Th>{t(other)}</Th>
          <Th>{t('status')}</Th>
          <Th className="w-40">{t('held')}</Th>
          <Th>{t('attention')}</Th>
        </tr>
      </THead>
      <TBody>
        {members.map(m => {
          const held = m.counts.VALID + m.counts.EXPIRING
          const attention = m.requirements.filter(r => r.status !== 'VALID')
          return (
            <Tr key={m.externalId}>
              <Td>
                <CellStack
                  title={
                    <TextLink asChild emphasis>
                      <Link href={`/employees/${m.externalId}`}>
                        {m.lastName} {m.firstName}
                      </Link>
                    </TextLink>
                  }
                  meta={m.externalId}
                />
              </Td>
              <Td>
                {other === 'department' ? (
                  <OrgLink kind="departments" id={m.departmentId} name={m.department} />
                ) : (
                  <OrgLink kind="positions" id={m.positionId} name={m.position} />
                )}
              </Td>
              <Td>
                <EmploymentBadge status={m.status} />
              </Td>
              <Td>
                {m.counts.total === 0 ? (
                  PLACEHOLDER
                ) : (
                  <BarRow
                    layout="inline"
                    bar={
                      <Meter
                        value={held}
                        max={m.counts.total}
                        label={t('held')}
                        tone={rateTone(held / m.counts.total)}
                      />
                    }
                    value={t('heldOf', {
                      held: formatInteger(held, locale),
                      total: formatInteger(m.counts.total, locale),
                    })}
                  />
                )}
              </Td>
              <Td>
                {m.counts.total === 0 ? (
                  <span className="text-fg-subtle">{t('nothingRequired')}</span>
                ) : attention.length === 0 ? (
                  <span className="text-fg-subtle">{t('allValid')}</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {attention.map(r => (
                      <li
                        key={r.courseCode}
                        className="flex flex-wrap items-center gap-x-2 gap-y-0.5"
                      >
                        <ComplianceBadge status={r.status} />
                        <TextLink asChild>
                          <Link
                            href={`/courses/${r.courseCode}`}
                            className="inline-flex min-h-6 items-center"
                          >
                            {r.courseName}
                          </Link>
                        </TextLink>
                        {r.booked && (
                          <TextLink asChild tone="muted">
                            <Link
                              href={`/sessions/${r.booked.sessionExternalId}`}
                              className="inline-flex min-h-6 items-center text-xs"
                            >
                              {t('booked', { date: formatDateTime(r.booked.startsAt, locale) })}
                            </Link>
                          </TextLink>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Td>
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
