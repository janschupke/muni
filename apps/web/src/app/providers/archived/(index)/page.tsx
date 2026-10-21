import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/list/search-params'

export const generateMetadata = () => archivedListMetadata('provider')

export default function ArchivedProvidersPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="provider" searchParams={searchParams} />
}
