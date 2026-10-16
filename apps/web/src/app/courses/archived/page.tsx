import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('course')

export default function ArchivedCoursesPage() {
  return <ArchivedListPage kind="course" />
}
