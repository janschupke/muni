import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('session')

export default function ArchivedSessionsPage() {
  return <ArchivedListPage kind="session" />
}
