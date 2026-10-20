import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/list/search-params'

export const generateMetadata = () => archivedListMetadata('position')

export default function ArchivedPositionsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="position" searchParams={searchParams} />
}
