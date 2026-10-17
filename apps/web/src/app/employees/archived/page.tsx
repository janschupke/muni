import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/search-params'

export const generateMetadata = () => archivedListMetadata('employee')

export default function ArchivedEmployeesPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="employee" searchParams={searchParams} />
}
