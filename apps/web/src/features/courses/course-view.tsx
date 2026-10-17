'use client'

import { COMPLIANCE_STATUSES } from '@muni/domain/enums'
import { BarRow } from '@muni/ui/bar-row'
import { Button } from '@muni/ui/button'
import { Card, CardBody, CardHeader } from '@muni/ui/card'
import { StatItem, StatList } from '@muni/ui/description-list'
import { EmptyState } from '@muni/ui/empty-state'
import { SplitLayout } from '@muni/ui/layout'
import { PageHeader } from '@muni/ui/page-header'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { formatInteger, formatPercent } from '@muni/utils/format'
import { useQuery } from '@tanstack/react-query'
import { CalendarPlus } from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'

import { BackLink } from '@/components/back-link'
import { RecentCompletionsTable } from '@/components/completion-tables'
import { ComplianceBar, ComplianceLegend } from '@/components/compliance-breakdown'
import { CourseByDepartment, CourseNeeds } from '@/components/course-panel'
import { ReadView } from '@/components/read-view'
import { RecordActions } from '@/components/record-actions'
import { RequirementList } from '@/components/requirement-list'
import { SessionTable } from '@/components/session-table'
import { DetailSkeleton } from '@/components/skeletons'
import { readQuery } from '@/lib/query/queries'
import { useDocumentTitle } from '@/lib/query/use-document-title'
import type { ReadOutput } from '@/server/reads/registry'

/**
 * A course's page: who must hold it, what a session needs, how many hold it and where, its
 * sessions and recent completions. Everything its opened row shows, and more.
 */
export function CourseView({ code, canEdit }: { code: string; canEdit: boolean }) {
  const read = useQuery(readQuery('course', { code }))
  useDocumentTitle(read.data?.name)
  return (
    <ReadView query={read} skeleton={<DetailSkeleton />} entity="courses">
      {course => <CourseDetail course={course} canEdit={canEdit} />}
    </ReadView>
  )
}

function CourseDetail({ course, canEdit }: { course: ReadOutput<'course'>; canEdit: boolean }) {
  const t = useTranslations('courses')
  const tc = useTranslations('common')
  const ts = useTranslations('status.compliance')
  const tp = useTranslations('courses.panel')
  const locale = useLocale()

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
            <RecordActions
              kind="course"
              id={course.id}
              name={course.name}
              editHref={`/courses/${course.code}/edit`}
              then="/courses"
            >
              <Button asChild variant="primary">
                <Link href={`/courses/${course.code}/sessions/new`}>
                  <CalendarPlus aria-hidden />
                  {t('newSession')}
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
              <CardHeader title={t('detail.requirements')} />
              <CardBody className="text-sm">
                <RequirementList requirements={course.requirements} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title={tp('needs')} />
              <CardBody>
                <CourseNeeds needs={course.sessionNeeds} />
              </CardBody>
            </Card>
          </div>
        }
        main={
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader
                title={t('detail.compliance')}
                description={t('detail.complianceDescription')}
              />
              <CardBody>
                {course.counts.total === 0 ? (
                  <EmptyState variant="inline" title={t('detail.nobodyRequired')} />
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
            <Card>
              <CardHeader title={tp('byDepartment')} />
              <CardBody>
                <CourseByDepartment byDepartment={course.byDepartment} />
              </CardBody>
            </Card>
          </div>
        }
      />

      <SectionHeading>{t('detail.sessions')}</SectionHeading>
      {course.sessions.length === 0 ? (
        <EmptyState title={t('detail.noSessions')} />
      ) : (
        <SessionTable
          sessions={course.sessions}
          canEdit={canEdit}
          showCourse={false}
          caption={t('detail.sessions')}
          panelLevel={3}
        />
      )}
      {/* Only the latest past sessions are here; the rest page in the sessions list. */}
      {course.pastTotal > course.pastShown && (
        <p className="mt-3 text-sm">
          <TextLink asChild arrow>
            <Link href={`/sessions?when=past&course=${encodeURIComponent(course.code)}`}>
              {t('detail.allPast', { count: course.pastTotal })}
            </Link>
          </TextLink>
        </p>
      )}

      <SectionHeading>{t('detail.recentCompletions')}</SectionHeading>
      {course.recentCompletions.length === 0 ? (
        <EmptyState title={t('detail.noCompletions')} />
      ) : (
        <RecentCompletionsTable
          completions={course.recentCompletions}
          courseName={course.name}
          canEdit={canEdit}
        />
      )}
    </>
  )
}
