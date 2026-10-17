import { recordExists } from '@muni/db/repositories'
import { canWrite } from '@muni/domain/enums'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { EmployeeView } from '@/features/employees/employee-view'
import { requireReader } from '@/server/auth'

interface Props {
  params: Promise<{ externalId: string }>
}

// The tab says the person's name once their data is there (useDocumentTitle).
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations('employees'))('title') }
}

export default async function EmployeePage({ params }: Props) {
  const user = await requireReader()
  const { externalId } = await params
  if (!(await recordExists('employee', externalId))) notFound()
  return <EmployeeView externalId={externalId} canEdit={canWrite(user.role)} />
}
