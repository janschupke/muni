import type { DepartmentDetail, PositionDetail } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { EmployeesTable } from '@/components/employees-table'

import { CourseComplianceTable } from './course-compliance-table'

/**
 * The body of a department's or position's page: its mandatory courses with why and how
 * much they are held, then its people, with the way to the same people in the full list.
 */
export function GroupMain({
  kind,
  group,
}: {
  kind: 'departments' | 'positions'
  group: DepartmentDetail | PositionDetail
}) {
  const t = useTranslations('org.detail')
  const tk = useTranslations(`${kind}.detail`)
  const filter = kind === 'departments' ? 'department' : 'position'
  return (
    <>
      <SectionHeading className="mt-0" description={t('coursesDescription')}>
        {t('courses')}
      </SectionHeading>
      {group.courses.length === 0 ? (
        <EmptyState variant="inline" title={tk('noCourses')} />
      ) : (
        <CourseComplianceTable courses={group.courses} />
      )}
      <SectionHeading>{t('people')}</SectionHeading>
      <EmployeesTable items={group.members} />
      <p className="mt-3 text-sm">
        <TextLink asChild>
          <Link
            href={`/employees?${filter}=${encodeURIComponent(group.name)}`}
            className="inline-flex items-center gap-1"
          >
            {tk('inList')}
            <ArrowRight aria-hidden className="size-3.5" />
          </Link>
        </TextLink>
      </p>
    </>
  )
}
