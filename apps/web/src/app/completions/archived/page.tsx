import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/list/search-params'

export const generateMetadata = () => archivedListMetadata('completion')

export default function ArchivedCompletionsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="completion" searchParams={searchParams} />
}
