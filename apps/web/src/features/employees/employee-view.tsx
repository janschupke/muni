'use client'

import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { DescriptionItem, DescriptionList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { ItemList, ItemListRow } from '@muni/ui/item-list'
import { SplitLayout } from '@muni/ui/layout'
import { Meter } from '@muni/ui/meter'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { CellStack } from '@muni/ui/table'
import { TextLink } from '@muni/ui/text-link'
import {
  formatDate,
  formatOptional,
  formatPercent,
  formatTimeRange,
  PLACEHOLDER,
} from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { PersonLink } from '@/components/archived'
import { BackLink } from '@/components/back-link'
import { CompletionHistoryTable } from '@/components/completion-tables'
import { OrgLink } from '@/components/org-links'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink, SessionDateLink } from '@/components/session-links'
import { DetailSkeleton } from '@/components/skeletons'
import { ComplianceBadge, EmploymentBadge, rateTone } from '@/components/status-badges'
import { TeamCard } from '@/components/team-card'
import { AddBookingForm } from '@/features/bookings/add-booking'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadOutput } from '@/server/reads/registry'

/** A person's page: profile, bookings, requirements and history, read for the signed-in role. */
export function EmployeeView({ externalId, canEdit }: { externalId: string; canEdit: boolean }) {
  const read = useQuery(readQuery('employee', { externalId }))
  const data = read.data
  useDocumentTitle(data && `${data.employee.firstName} ${data.employee.lastName}`)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="employees">
      {data => <EmployeeDetail {...data} canEdit={canEdit} />}
    </ReadView>
  )
}

function EmployeeDetail({
  employee,
  bookings,
  bookable,
  showNotes,
  canEdit,
}: ReadOutput<'employee'> & { canEdit: boolean }) {
  const t = useTranslations('employees.detail')
  const te = useTranslations('employees')
  const tc = useTranslations('courses')
  const tb = useTranslations('bookings')
  const locale = useLocale()
  const name = `${employee.firstName} ${employee.lastName}`
  const date = (value: string | null) => formatOptional(value, v => formatDate(v, locale))
  const held = employee.requirements.filter(
    r => r.status === 'VALID' || r.status === 'EXPIRING'
  ).length

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/employees', label: te('title') }} />}
        title={name}
        description={[employee.position, employee.department].filter(Boolean).join(' · ')}
        actions={
          canEdit && (
            <RecordActions
              kind="employee"
              id={employee.id}
              name={name}
              editHref={`/employees/${employee.externalId}/edit`}
              then="/employees"
            >
              <Button asChild variant="primary">
                <Link href={`/employees/${employee.externalId}/completions/new`}>
                  <Plus aria-hidden />
                  {t('recordCompletion')}
                </Link>
              </Button>
            </RecordActions>
          )
        }
      />

      <SplitLayout
        side={
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader title={t('profile')} />
              <CardBody>
                <DescriptionList>
                  <DescriptionItem label="ID">{employee.externalId}</DescriptionItem>
                  <DescriptionItem label={te('columns.status')}>
                    <EmploymentBadge status={employee.status} />
                  </DescriptionItem>
                  {'email' in employee && (
                    <DescriptionItem label={t('email')}>
                      {employee.email ?? PLACEHOLDER}
                    </DescriptionItem>
                  )}
                  {'nationalId' in employee && (
                    <DescriptionItem label={t('nationalId')}>
                      {employee.nationalId ?? PLACEHOLDER}
                    </DescriptionItem>
                  )}
                  <DescriptionItem label={te('columns.department')}>
                    <OrgLink
                      kind="departments"
                      id={employee.departmentId}
                      name={employee.department}
                    />
                  </DescriptionItem>
                  <DescriptionItem label={te('columns.position')}>
                    <OrgLink kind="positions" id={employee.positionId} name={employee.position} />
                  </DescriptionItem>
                  <DescriptionItem label={t('manager')}>
                    {employee.manager ? <PersonLink person={employee.manager} /> : PLACEHOLDER}
                  </DescriptionItem>
                  <DescriptionItem label={t('hiredOn')}>{date(employee.hiredOn)}</DescriptionItem>
                  {employee.leftOn && (
                    <DescriptionItem label={t('leftOn')}>{date(employee.leftOn)}</DescriptionItem>
                  )}
                  {'note' in employee && employee.note && (
                    <DescriptionItem label={t('note')}>
                      <span className="whitespace-pre-line">{employee.note}</span>
                    </DescriptionItem>
                  )}
                </DescriptionList>
              </CardBody>
            </Card>
            {employee.reports.length > 0 && <TeamCard employee={employee} />}
            <Card>
              <CardHeader title={t('bookings')} />
              <CardBody className="flex flex-col gap-4">
                {canEdit && employee.status !== 'LEFT' && (
                  <AddBookingForm
                    fixed={{ employeeExternalId: employee.externalId }}
                    field="sessionExternalId"
                    label={tb('session')}
                    options={bookable.map(s => ({
                      value: s.externalId,
                      label: tb('sessionOption', {
                        when: formatTimeRange(s.startsAt, s.endsAt, locale),
                        course: s.courseName,
                        free: s.free,
                      }),
                    }))}
                  />
                )}
                {bookings.length === 0 ? (
                  <EmptyState variant="inline" title={t('noBookings')} />
                ) : (
                  <ItemList>
                    {bookings.map(b => (
                      <ItemListRow key={b.sessionExternalId}>
                        <CellStack
                          title={
                            <TextLink asChild emphasis>
                              <Link href={`/courses/${b.courseCode}`}>{b.courseName}</Link>
                            </TextLink>
                          }
                          meta={
                            <>
                              <SessionDateLink
                                session={{
                                  externalId: b.sessionExternalId,
                                  startsAt: b.startsAt,
                                  endsAt: b.endsAt,
                                }}
                              />
                              {' · '}
                              <RoomLink room={b.room} />
                            </>
                          }
                        />
                        {canEdit && (
                          <RemoveBookingButton
                            sessionExternalId={b.sessionExternalId}
                            employeeExternalId={employee.externalId}
                            label={t('cancelBooking', { course: b.courseName })}
                            confirmTitle={t('cancelBookingConfirm', { course: b.courseName })}
                          />
                        )}
                      </ItemListRow>
                    ))}
                  </ItemList>
                )}
              </CardBody>
            </Card>
          </div>
        }
        main={
          <Card>
            <CardHeader
              title={t('requirements')}
              description={
                employee.requirements.length > 0
                  ? t('rate', { rate: formatPercent(employee.completionRate, locale) })
                  : t('requirementsDescription')
              }
            />
            <CardBody>
              {employee.requirements.length === 0 ? (
                <EmptyState variant="inline" title={t('noRequirements')} />
              ) : (
                <>
                  <BarRow
                    layout="inline"
                    className="mb-3"
                    bar={
                      <Meter
                        value={held}
                        max={employee.requirements.length}
                        label={te('columns.valid')}
                        size="md"
                        tone={rateTone(employee.completionRate)}
                      />
                    }
                    value={te('validOf', { valid: held, total: employee.requirements.length })}
                  />
                  <ItemList>
                    {employee.requirements.map(r => (
                      <ItemListRow key={r.courseCode}>
                        <TextLink asChild emphasis>
                          <Link href={`/courses/${r.courseCode}`}>{r.courseName}</Link>
                        </TextLink>
                        <span className="flex items-center gap-3 text-fg-muted">
                          {r.validUntil && (
                            <span>
                              {tc('detail.validUntil')} {date(r.validUntil)}
                            </span>
                          )}
                          <ComplianceBadge status={r.status} />
                        </span>
                      </ItemListRow>
                    ))}
                  </ItemList>
                </>
              )}
            </CardBody>
          </Card>
        }
      />

      <SectionHeading>{t('history')}</SectionHeading>
      {employee.completions.length === 0 ? (
        <EmptyState title={t('noHistory')} />
      ) : (
        <CompletionHistoryTable
          completions={employee.completions}
          showNotes={showNotes}
          editFor={canEdit ? employee.externalId : undefined}
        />
      )}
    </>
  )
}
