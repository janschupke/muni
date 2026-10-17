import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/search-params'

export const generateMetadata = () => archivedListMetadata('session')

export default function ArchivedSessionsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="session" searchParams={searchParams} />
}
