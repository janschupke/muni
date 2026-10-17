import type { EmployeeListItem, Page } from '@muni/db/repositories'
import { BarRow } from '@muni/ui/bar-row'
import { DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { Meter } from '@muni/ui/meter'
import { Pagination } from '@muni/ui/pagination'
import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDateTime, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { OrgLink } from '@/components/org-links'
import { usePaginationLabels } from '@/components/pagination-labels'
import { ComplianceBadge, EmploymentBadge, rateTone } from '@/components/status-badges'
import { useOfTotal } from '@/lib/use-of-total'

/**
 * A department's or position's people, one record each: where else they sit, their
 * employment, how much of what they must hold they hold, and every training that needs
 * attention (expired, missing or expiring) with its booking, if any. A page at a time, cut on
 * the server, the most urgent first.
 */
export function MembersTable({
  name,
  members: page,
  onPageChange,
  other,
}: {
  /** The group's name, for the table's accessible name. */
  name: string
  members: Page<EmployeeListItem>
  onPageChange: (page: number) => void
  /** The other side of each person's place: positions in a department, and the reverse. */
  other: 'department' | 'position'
}) {
  const t = useTranslations('org.members')
  const ofTotal = useOfTotal()
  const labels = usePaginationLabels()
  const members = page.items
  if (page.total === 0) return <EmptyState variant="inline" title={t('none')} />
  return (
    <DetailPanel title={t('title')} count={page.total} flush>
      <Table density="compact" paging="server" aria-label={t('label', { name })}>
        <THead>
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
                      value={ofTotal(held, m.counts.total)}
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
                          <TextLink asChild hitArea>
                            <Link href={`/courses/${r.courseCode}`}>{r.courseName}</Link>
                          </TextLink>
                          {r.booked && (
                            <TextLink asChild hitArea className="text-xs">
                              <Link href={`/sessions/${r.booked.sessionExternalId}`}>
                                {t('booked', { date: formatDateTime(r.booked.startsAt) })}
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
      <Pagination
        className="px-4 pb-3"
        page={page.page}
        pageCount={page.pageCount}
        onPageChange={onPageChange}
        labels={{ ...labels, status: labels.status(page.page, page.pageCount) }}
      />
    </DetailPanel>
  )
}
