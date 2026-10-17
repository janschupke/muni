import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'
import type { SearchParams } from '@/lib/search-params'

export const generateMetadata = () => archivedListMetadata('course')

export default function ArchivedCoursesPage({ searchParams }: { searchParams: SearchParams }) {
  return <ArchivedListPage kind="course" searchParams={searchParams} />
}
