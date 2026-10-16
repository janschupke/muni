import { listDepartmentSummaries } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { ListActions } from '@/components/list-actions'
import { GroupsTable } from '@/features/org/groups-table'
import { requireReader } from '@/server/auth'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentsPage() {
  const user = await requireReader()
  const [departments, t] = await Promise.all([
    listDepartmentSummaries(),
    getTranslations('departments'),
  ])
  return (
    <>
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={canWrite(user.role) && <ListActions kind="department" />}
      />
      {departments.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <GroupsTable kind="departments" groups={departments} />
      )}
    </>
  )
}
