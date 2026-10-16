import { getCourse } from '@muni/db/repositories'
import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { StatItem, StatList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { formatInteger, formatPercent, PLACEHOLDER } from '@muni/utils/format'
import { CalendarPlus, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { cache } from 'react'

import { BackLink } from '@/components/back-link'
import { RecentCompletionsTable } from '@/components/completion-tables'
import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { RequirementList } from '@/components/requirement-list'
import { SessionTable } from '@/components/session-table'
import { getViewer } from '@/server/auth'

type Props = { params: Promise<{ code: string }> }

const loadCourse = cache((code: string) => getCourse(code))

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params
  return { title: (await loadCourse(code))?.name ?? code }
}

export default async function CoursePage({ params }: Props) {
  const { code } = await params
  const [course, viewer, t, tc, ts, locale] = await Promise.all([
    loadCourse(code),
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
        eyebrow={<BackLink fallback={{ href: '/courses', label: t('title') }} />}
        title={course.name}
        description={`${course.code} · ${
          course.validityMonths === null
            ? tc('noExpiry')
            : tc('months', { count: course.validityMonths })
        }`}
        actions={
          canEdit && (
            <>
              <Button asChild variant="primary">
                <Link href={`/courses/${course.code}/sessions/new`}>
                  <CalendarPlus aria-hidden />
                  {t('newSession')}
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/courses/${course.code}/edit`}>
                  <Pencil aria-hidden />
                  {tc('edit')}
                </Link>
              </Button>
            </>
          )
        }
      />

      <SplitLayout
        side={
          <Card>
            <CardHeader title={t('detail.requirements')} />
            <CardBody className="text-sm">
              <RequirementList requirements={course.requirements} />
            </CardBody>
          </Card>
        }
        main={
          <Card>
            <CardHeader
              title={t('detail.compliance')}
              description={t('detail.complianceDescription')}
            />
            <CardBody>
              {course.counts.total === 0 ? (
                <EmptyState variant="inline" title={PLACEHOLDER} />
              ) : (
                <>
                  <BarRow
                    label={<ComplianceLegend />}
                    value={formatPercent(course.rate, locale)}
                    bar={<ComplianceBar counts={course.counts} label={course.name} />}
                  />
                  <StatList className="mt-3">
                    {COMPLIANCE_STATUSES.map(s => (
                      <StatItem key={s} label={ts(s)}>
                        {formatInteger(course.counts[s], locale)}
                      </StatItem>
                    ))}
                  </StatList>
                </>
              )}
            </CardBody>
          </Card>
        }
      />

      <SectionHeading>{t('detail.sessions')}</SectionHeading>
      {course.sessions.length === 0 ? (
        <EmptyState title={t('detail.noSessions')} />
      ) : (
        <SessionTable sessions={course.sessions} canEdit={canEdit} showCourse={false} />
      )}

      <SectionHeading>{t('detail.recentCompletions')}</SectionHeading>
      {course.recentCompletions.length === 0 ? (
        <EmptyState title={t('detail.noCompletions')} />
      ) : (
        <RecentCompletionsTable completions={course.recentCompletions} />
      )}
    </>
  )
}
