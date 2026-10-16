import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('department')

export default function ArchivedDepartmentsPage() {
  return <ArchivedListPage kind="department" />
}
