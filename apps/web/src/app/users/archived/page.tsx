import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/search-params'

export const generateMetadata = () => archivedListMetadata('user')

export default function ArchivedUsersPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="user" searchParams={searchParams} />
}
