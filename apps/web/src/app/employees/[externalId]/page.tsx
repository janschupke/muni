import { getEmployee, listEmployeeBookings } from '@muni/db/repositories'
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
import { TextLink } from '@muni/ui/text-link'
import { CellStack } from '@muni/ui/table'
import { formatDate, formatOptional, formatPercent, PLACEHOLDER } from '@muni/utils/format'
import { Pencil, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { CompletionHistoryTable } from '@/components/completion-tables'
import { RemoveBookingButton } from '@/components/remove-booking-button'
import { RoomLink, SessionDateLink } from '@/components/session-links'
import { ComplianceBadge, EmploymentBadge, rateTone } from '@/components/status-badges'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ externalId: string }> }

// One fetch per request for both the title and the page.
const loadEmployee = cache(async (externalId: string) => getEmployee(externalId, await getViewer()))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { externalId } = await params
  const employee = await loadEmployee(externalId)
  return { title: employee ? `${employee.firstName} ${employee.lastName}` : externalId }
}

export default async function EmployeePage({ params }: Props) {
  const { externalId } = await params
  const viewer = await getViewer()
  const [employee, bookings, t, te, tc, tCommon, locale] = await Promise.all([
    loadEmployee(externalId),
    listEmployeeBookings(externalId),
    getTranslations('employees.detail'),
    getTranslations('employees'),
    getTranslations('courses'),
    getTranslations('common'),
    getLocale(),
  ])
  if (!employee) notFound()
  const canEdit = viewer === 'authenticated'
  const date = (value: string | null) => formatOptional(value, v => formatDate(v, locale))
  const held = employee.requirements.filter(
    r => r.status === 'VALID' || r.status === 'EXPIRING'
  ).length

  return (
    <>
      <PageHeader
        eyebrow={<BackLink fallback={{ href: '/employees', label: te('title') }} />}
        title={`${employee.firstName} ${employee.lastName}`}
        description={[employee.position, employee.department].filter(Boolean).join(' · ')}
        actions={
          canEdit && (
            <>
              <Button asChild variant="primary">
                <Link href={`/employees/${employee.externalId}/completions/new`}>
                  <Plus aria-hidden />
                  {t('recordCompletion')}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/employees/${employee.externalId}/edit`}>
                  <Pencil aria-hidden />
                  {tCommon('edit')}
                </Link>
              </Button>
            </>
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
                  <DescriptionItem label={t('manager')}>
                    {employee.manager ? (
                      <TextLink asChild>
                        <Link href={`/employees/${employee.manager.externalId}`}>
                          {employee.manager.name}
                        </Link>
                      </TextLink>
                    ) : (
                      PLACEHOLDER
                    )}
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
            <Card>
              <CardHeader title={t('bookings')} />
              <CardBody>
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
        <CompletionHistoryTable completions={employee.completions} showNotes={canEdit} />
      )}
    </>
  )
}
