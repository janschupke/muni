import { listDepartmentSummaries } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { getTranslations } from 'next-intl/server'

import { GroupsTable } from '@/features/org/groups-table'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentsPage() {
  // Live data: render per request, never at build time (nothing else here reads the request).
  await connection()
  const [departments, t] = await Promise.all([
    listDepartmentSummaries(),
    getTranslations('departments'),
  ])
  return (
    <>
      <PageHeader title={t('title')} description={t('description')} />
      {departments.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <GroupsTable kind="departments" groups={departments} />
      )}
    </>
  )
}
