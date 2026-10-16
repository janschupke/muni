import { listDepartmentSummaries } from '@muni/db/repositories'
import { EmptyState } from '@muni/ui/empty-state'
import { PageHeader } from '@muni/ui/page-header'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { DepartmentsTable } from '@/features/org/departments-table'

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('departments'))('title') }
}

export default async function DepartmentsPage() {
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
        <DepartmentsTable departments={departments} />
      )}
    </>
  )
}
