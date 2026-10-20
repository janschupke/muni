import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/list/search-params'

export const generateMetadata = () => archivedListMetadata('department')

export default function ArchivedDepartmentsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="department" searchParams={searchParams} />
}
