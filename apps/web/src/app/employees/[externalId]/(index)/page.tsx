import { canWrite } from '@muni/domain/enums'
import { displayName } from '@muni/domain/names'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { EmployeeView } from '@/features/employees/employee-view'
import { HISTORY_SORT } from '@/lib/list/list-keys'
import { parseList, type SearchParams } from '@/lib/list/search-params'
import { requireReader } from '@/server/auth'
import { prefetched, titleOf } from '@/server/prefetch'

interface Props {
  params: Promise<{ externalId: string }>
  /** Its lists' sort and page (`completionsSort`…). */
  searchParams: SearchParams
}

const inputOf = async ({ params, searchParams }: Props) => {
  const [{ externalId }, query] = await Promise.all([params, searchParams])
  return {
    externalId,
    ...parseList(query, HISTORY_SORT, 'completions'),
  }
}

/** The record's name, from the read the page shows (the list's title while it is not there). */
export async function generateMetadata(props: Props): Promise<Metadata> {
  return titleOf(
    { name: 'employee', input: await inputOf(props) },
    data => displayName(data.employee),
    (await getTranslations('employees'))('title')
  )
}

export default async function EmployeePage(props: Props) {
  const user = await requireReader()
  const input = await inputOf(props)
  return prefetched(
    user,
    [{ name: 'employee', input }],
    <EmployeeView externalId={input.externalId} canEdit={canWrite(user.role)} />
  )
}
