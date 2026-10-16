import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('user')

export default function ArchivedUsersPage() {
  return <ArchivedListPage kind="user" />
}
