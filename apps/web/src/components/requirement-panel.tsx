'use client'

import type { EmployeeListRequirement } from '@muni/db/repositories'
import { needsBooking } from '@muni/domain/advisor'
import type { EmploymentState } from '@muni/domain/enums'
import { DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatDateTime, formatRelativeDays, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { BookNeedButton } from '@/features/bookings/book-button'

import { ComplianceBadge } from './status-badges'

/** Whose requirements: the person they belong to, and whether they are at work. */
export interface RequirementPerson {
  externalId: string
  name: string
  status: EmploymentState
}

/** One person's required courses: state, expiry and any booking (an employee row's detail). */
export function RequirementPanel({
  person,
  requirements,
  canBook,
  level = 2,
}: {
  person: RequirementPerson
  requirements: EmployeeListRequirement[]
  canBook: boolean
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
    >
      {requirements.length === 0 ? (
        <EmptyState variant="inline" title={t('none')} />
      ) : (
        <RequirementTable person={person} requirements={requirements} canBook={canBook} />
      )}
    </DetailPanel>
  )
}

/**
 * Each required course of one person: its state, until when it is valid (and in how many
 * days), when it was last completed and the booking that renews it; for admins, "Book…" on
 * each one to book now. The row panel and the person's page share it.
 */
export function RequirementTable({
  person,
  requirements,
  canBook,
}: {
  person: RequirementPerson
  requirements: EmployeeListRequirement[]
  canBook: boolean
}) {
  const t = useTranslations('employees.panel')
  const tb = useTranslations('bookings')
  return (
    <RequirementRows
      caption={t('title')}
      lead={t('course')}
      paging="the trainings one person must hold: bounded by the catalogue"
      canBook={canBook}
      rows={requirements.map(r => ({
        key: r.courseCode,
        lead: (
          <TextLink asChild hitArea>
            <Link href={`/courses/${r.courseCode}`}>{r.courseName}</Link>
          </TextLink>
        ),
        requirement: r,
        person,
        bookLabel: tb('bookFor', { course: r.courseName, name: person.name }),
      }))}
    />
  )
}

/** A requirement as a row: what leads it (the course, or the person), and whose it is. */
export interface RequirementRow {
  key: string
  lead: ReactNode
  requirement: EmployeeListRequirement
  person: RequirementPerson
  /** "Book…"'s accessible name: whom and what it books. */
  bookLabel: string
}

/**
 * Requirements as a table: one person's courses, or one course's people (a matrix cell). The
 * last column books a row that needs it (`needsBooking`): the dialog proposes a session.
 */
export function RequirementRows({
  caption,
  lead,
  rows,
  paging,
  canBook,
}: {
  caption: string
  /** The first column's header: the course, or the person. */
  lead: string
  rows: RequirementRow[]
  /** Why the table holds every row (see `Table`). */
  paging: string
  canBook: boolean
}) {
  const t = useTranslations('employees.panel')
  const tc = useTranslations('common')
  const locale = useLocale()
  const bookable = (row: RequirementRow) =>
    canBook && needsBooking(row.requirement, row.person.status)
  const booking = rows.some(bookable)
  return (
    <Table density="compact" paging={paging} aria-label={caption}>
      <THead>
        <tr>
          <Th>{lead}</Th>
          <Th>{t('status')}</Th>
          <Th>{t('validUntil')}</Th>
          <Th>{t('completedOn')}</Th>
          <Th>{t('booked')}</Th>
          {booking && (
            <Th className="w-0">
              <span className="sr-only">{t('book')}</span>
            </Th>
          )}
        </tr>
      </THead>
      <TBody>
        {rows.map(row => {
          const r = row.requirement
          return (
            <Tr key={row.key}>
              <Td>{row.lead}</Td>
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
                    {formatDate(r.validUntil)}
                    {r.daysLeft !== null && (
                      <span className="ml-1.5 text-xs text-fg-muted">
                        ({formatRelativeDays(r.daysLeft, locale)})
                      </span>
                    )}
                  </>
                )}
              </Td>
              <Td nowrap>{r.completedOn === null ? PLACEHOLDER : formatDate(r.completedOn)}</Td>
              <Td nowrap>
                {r.booked ? (
                  <TextLink asChild hitArea>
                    <Link href={`/sessions/${r.booked.sessionExternalId}`}>
                      {formatDateTime(r.booked.startsAt)}
                    </Link>
                  </TextLink>
                ) : (
                  PLACEHOLDER
                )}
              </Td>
              {booking && (
                <Td align="right" nowrap>
                  {bookable(row) && (
                    <BookNeedButton
                      query={{ employee: row.person.externalId, course: r.courseCode }}
                      label={row.bookLabel}
                    />
                  )}
                </Td>
              )}
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
