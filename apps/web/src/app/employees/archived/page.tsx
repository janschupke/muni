import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('employee')

export default function ArchivedEmployeesPage() {
  return <ArchivedListPage kind="employee" />
}
