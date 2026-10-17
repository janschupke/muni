import type { EmployeeListRequirement } from '@muni/db/repositories'
import { Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatDateTime, formatRelativeDays, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ComplianceBadge } from './status-badges'

/** One person's required courses: state, expiry and any booking (an employee row's detail). */
export function RequirementPanel({ requirements }: { requirements: EmployeeListRequirement[] }) {
  const t = useTranslations('employees.panel')
  const tc = useTranslations('common')
  const locale = useLocale()
  if (requirements.length === 0) return <p className="text-sm text-fg-muted">{t('none')}</p>
  return (
    <Table density="compact" className="max-w-4xl">
      <THead className="bg-transparent">
        <tr>
          <Th>{t('course')}</Th>
          <Th>{t('status')}</Th>
          <Th>{t('validUntil')}</Th>
          <Th>{t('completedOn')}</Th>
          <Th>{t('booked')}</Th>
        </tr>
      </THead>
      <TBody>
        {requirements.map(r => (
          <Tr key={r.courseCode}>
            <Td>
              <TextLink asChild>
                <Link href={`/courses/${r.courseCode}`}>{r.courseName}</Link>
              </TextLink>
            </Td>
            <Td>
              <ComplianceBadge status={r.status} />
            </Td>
            <Td nowrap>
              {r.validUntil === null ? (
                r.completedOn === null ? (
                  PLACEHOLDER
                ) : (
                  tc('noExpiry')
                )
              ) : (
                <>
                  {formatDate(r.validUntil, locale)}
                  {r.daysLeft !== null && (
                    <span className="ml-1.5 text-xs text-fg-muted">
                      ({formatRelativeDays(r.daysLeft, locale)})
                    </span>
                  )}
                </>
              )}
            </Td>
            <Td nowrap>
              {r.completedOn === null ? PLACEHOLDER : formatDate(r.completedOn, locale)}
            </Td>
            <Td nowrap>
              {r.booked ? (
                <TextLink asChild>
                  <Link href={`/sessions/${r.booked.sessionExternalId}`}>
                    {formatDateTime(r.booked.startsAt, locale)}
                  </Link>
                </TextLink>
              ) : (
                PLACEHOLDER
              )}
            </Td>
          </Tr>
        ))}
      </TBody>
    </Table>
  )
}
