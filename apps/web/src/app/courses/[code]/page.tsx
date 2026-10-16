import { getCourse } from '@muni/db/repositories'
import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { buttonClass } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import { Table, TableContainer, TBody, Td, Th, THead, Tr } from '@muni/ui/table'
import { formatDate, formatPercent } from '@muni/utils/format'
import { Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { RequirementList } from '@/components/requirement-list'
import { SessionTable } from '@/components/session-table'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ code: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).code }
}

export default async function CoursePage({ params }: Props) {
  const { code } = await params
  const [course, viewer, t, tc, ts, locale] = await Promise.all([
    getCourse(code),
    getViewer(),
    getTranslations('courses'),
    getTranslations('common'),
    getTranslations('status.compliance'),
    getLocale(),
  ])
  if (!course) notFound()
  const canEdit = viewer === 'authenticated'

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/courses" className="hover:underline">
            {t('title')}
          </Link>
        }
        title={course.name}
        description={`${course.code} · ${
          course.validityMonths === null
            ? tc('noExpiry')
            : tc('months', { count: course.validityMonths })
        }`}
        actions={
          canEdit && (
            <Link href={`/courses/${course.code}/edit`} className={buttonClass()}>
              <Pencil aria-hidden />
              {tc('edit')}
            </Link>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title={t('detail.requirements')} />
          <CardBody className="text-sm">
            <RequirementList requirements={course.requirements} />
          </CardBody>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader
            title={t('detail.compliance')}
            description={t('detail.complianceDescription')}
          />
          <CardBody>
            {course.counts.total === 0 ? (
              <p className="text-sm text-fg-muted">—</p>
            ) : (
              <>
                <div className="mb-2 flex items-baseline justify-between">
                  <ComplianceLegend />
                  <span className="text-lg font-semibold tabular-nums">
                    {formatPercent(course.rate, locale)}
                  </span>
                </div>
                <ComplianceBar counts={course.counts} label={course.name} />
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                  {COMPLIANCE_STATUSES.map(s => (
                    <div key={s}>
                      <dt className="text-fg-muted">{ts(s)}</dt>
                      <dd className="font-medium tabular-nums">{course.counts[s]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <h2 className="mt-8 mb-3 text-base font-semibold">{t('detail.sessions')}</h2>
      {course.sessions.length === 0 ? (
        <EmptyState title={t('detail.noSessions')} />
      ) : (
        <SessionTable sessions={course.sessions} canEdit={canEdit} showCourse={false} />
      )}

      <h2 className="mt-8 mb-3 text-base font-semibold">{t('detail.recentCompletions')}</h2>
      {course.recentCompletions.length === 0 ? (
        <EmptyState title={t('detail.noCompletions')} />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>{t('detail.employee')}</Th>
                <Th>{t('detail.completedOn')}</Th>
                <Th>{t('detail.validUntil')}</Th>
              </tr>
            </THead>
            <TBody>
              {course.recentCompletions.map(c => (
                <Tr key={c.externalId}>
                  <Td>
                    <Link href={`/employees/${c.employeeExternalId}`} className="hover:underline">
                      {c.employeeName}
                    </Link>
                  </Td>
                  <Td>{formatDate(c.completedOn, locale)}</Td>
                  <Td>{c.validUntil ? formatDate(c.validUntil, locale) : tc('noExpiry')}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
