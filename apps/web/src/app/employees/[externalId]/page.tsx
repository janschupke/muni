import { canWrite } from '@muni/domain/enums'
import { displayName } from '@muni/domain/names'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeeView } from '@/features/employees/employee-view'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ externalId: string }>
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { externalId } = await params
  return titleOf(
    { name: 'employee', input: { externalId } },
    data => displayName(data.employee),
    (await getTranslations('employees'))('title')
  )
}

export default async function EmployeePage({ params }: Props) {
  const user = await requireReader()
  const { externalId } = await params
  return prefetched(
    user,
    [{ name: 'employee', input: { externalId } }],
    <EmployeeView externalId={externalId} canEdit={canWrite(user.role)} />
  )
}
