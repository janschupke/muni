import type { TablePaging } from '@muni/ui/data-table'
import { EmptyState } from '@muni/ui/empty-state'
import { SectionHeading } from '@muni/ui/section-heading'
import { TextLink } from '@muni/ui/text-link'
import { useTranslations } from 'next-intl'

import { Link } from '@/components/navigation/link'
import { EmployeesTable } from '@/features/employees/employees-table'
import type { PageInfo } from '@/lib/list/use-list-url'
import type { ReadOutput } from '@/server/reads/core/registry'

import { CourseComplianceTable } from './course-compliance-table'

type Kind = 'departments' | 'positions'
type Group = ReadOutput<'department'> | ReadOutput<'position'>

/** A department's or position's mandatory courses, with why and how much they are held. */
export function GroupCourses({ kind, group }: { kind: Kind; group: Group }) {
  const t = useTranslations('org.detail')
  const tk = useTranslations(`${kind}.detail`)
  return (
    <>
      <SectionHeading className="mt-0" description={t('coursesDescription')}>
        {t('courses')}
      </SectionHeading>
      {group.courses.length === 0 ? (
        <EmptyState variant="inline" title={tk('noCourses')} />
      ) : (
        <CourseComplianceTable courses={group.courses} label={t('courses')} />
      )}
    </>
  )
}

/**
 * A department's or position's people, a page at a time, full width below the facts and
 * courses, with the way to the same people in the full list.
 */
export function GroupPeople({
  kind,
  group,
  paging,
  canBook,
}: {
  kind: Kind
  group: Group
  paging: (page: PageInfo) => TablePaging
  /** Admins book each person's trainings from here. */
  canBook: boolean
}) {
  const t = useTranslations('org.detail')
  const tk = useTranslations(`${kind}.detail`)
  const filter = kind === 'departments' ? 'department' : 'position'
  return (
    <>
      <SectionHeading
        description={
          group.members.total > 0 && t('peopleDescription', { count: group.members.total })
        }
      >
        {t('people')}
      </SectionHeading>
      {group.members.total === 0 ? (
        <EmptyState title={t('noPeople')} />
      ) : (
        <>
          <EmployeesTable
            items={group.members.items}
            paging={paging(group.members)}
            omit={filter}
            canBook={canBook}
            caption={t('people')}
            panelLevel={3}
          />
          <p className="mt-3 text-sm">
            <TextLink asChild arrow>
              <Link href={`/employees?${filter}=${encodeURIComponent(group.name)}`}>
                {tk('inList')}
              </Link>
            </TextLink>
          </p>
        </>
      )}
    </>
  )
}
