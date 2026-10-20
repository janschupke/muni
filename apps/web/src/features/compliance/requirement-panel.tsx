'use client'

import type { EmployeeListRequirement } from '@muni/db/repositories'
import { bookingState } from '@muni/domain/advisor'
import type { EmploymentState } from '@muni/domain/enums'
import { DetailPanel } from '@muni/ui/detail-panel'
import { EmptyState } from '@muni/ui/empty-state'
import { CellStack, Table, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import { formatDate, formatRelativeDays, PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { ComplianceBadge } from '@/components/badges/status-badges'
import { BookNeedButton } from '@/features/bookings/book-button'
import { RemoveBookingButton } from '@/features/bookings/remove-booking-button'
import { RoomLink, SessionDateLink } from '@/features/sessions/session-links'

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
 * days), when it was last completed and the booking that renews it (when and where); for
 * admins, the way to book each one, or to cancel its booking. The row panel and the person's
 * page share it.
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
        course: r.courseName,
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
  /** The course's name, for the actions' accessible names. */
  course: string
}

/**
 * Requirements as a table: one person's courses, or one course's people (a matrix cell). For
 * admins, the last column holds each row's action, one column so they line up: "Book…" for a
 * training to book (`bookingState`; the dialog proposes a session), the same dimmed with the
 * reason when it cannot be booked, or the way to cancel its booking.
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
  const tb = useTranslations('bookings')
  const locale = useLocale()
  const action = (row: RequirementRow): ReactNode => {
    if (!canBook) return null
    const r = row.requirement
    const names = { course: row.course, name: row.person.name }
    if (r.booked)
      return (
        <RemoveBookingButton
          sessionExternalId={r.booked.sessionExternalId}
          employeeExternalId={row.person.externalId}
          label={tb('cancelFor', names)}
          confirmTitle={tb('cancelForConfirm', names)}
        />
      )
    const state = bookingState(r, row.person.status)
    if (!state) return null
    return (
      <BookNeedButton
        query={{ employee: row.person.externalId, course: r.courseCode }}
        label={tb('bookFor', names)}
        blocked={state.kind === 'BLOCKED' ? { of: 'training', reason: state.reason } : null}
      />
    )
  }
  const actions = rows.map(action)
  const acting = actions.some(a => a !== null)
  return (
    <Table density="compact" paging={paging} aria-label={caption}>
      <THead>
        <tr>
          <Th>{lead}</Th>
          <Th>{t('status')}</Th>
          <Th>{t('validUntil')}</Th>
          <Th>{t('completedOn')}</Th>
          <Th>{t('booked')}</Th>
          {acting && (
            <Th className="w-0">
              <span className="sr-only">{t('book')}</span>
            </Th>
          )}
        </tr>
      </THead>
      <TBody>
        {rows.map((row, i) => {
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
                  <CellStack
                    title={
                      <SessionDateLink
                        session={{ ...r.booked, externalId: r.booked.sessionExternalId }}
                      />
                    }
                    meta={<RoomLink room={r.booked.room} />}
                  />
                ) : (
                  PLACEHOLDER
                )}
              </Td>
              {acting && (
                <Td align="right" nowrap>
                  {actions[i]}
                </Td>
              )}
            </Tr>
          )
        })}
      </TBody>
    </Table>
  )
}
