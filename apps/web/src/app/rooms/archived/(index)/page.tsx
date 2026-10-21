import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/list/search-params'

export const generateMetadata = () => archivedListMetadata('room')

export default function ArchivedRoomsPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="room" searchParams={searchParams} />
}
