import type { EmployeeListRequirement } from '@muni/db/repositories'
import { DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatDateTime, formatRelativeDays, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { ComplianceBadge } from './status-badges'

/** One person's required courses: state, expiry and any booking (an employee row's detail). */
export function RequirementPanel({
  requirements,
  level = 2,
}: {
  requirements: EmployeeListRequirement[]
  /** `h2` under the page's `h1`, `h3` under a section's `h2`. */
  level?: 2 | 3 | undefined
}) {
  const t = useTranslations('employees.panel')
  return (
    <DetailPanel
      title={t('title')}
      level={level}
      count={requirements.length}
      flush={requirements.length > 0}
      className="max-w-5xl"
    >
      {requirements.length === 0 ? (
        <EmptyState variant="inline" title={t('none')} />
      ) : (
        <RequirementTable requirements={requirements} />
      )}
    </DetailPanel>
  )
}

function RequirementTable({ requirements }: { requirements: EmployeeListRequirement[] }) {
  const t = useTranslations('employees.panel')
  const tc = useTranslations('common')
  const locale = useLocale()
  return (
    <Table density="compact" aria-label={t('title')}>
      <THead>
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
              <TextLink asChild hitArea>
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
                <TextLink asChild hitArea>
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
