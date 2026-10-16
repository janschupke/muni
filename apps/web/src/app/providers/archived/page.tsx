import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('provider')

export default function ArchivedProvidersPage() {
  return <ArchivedListPage kind="provider" />
}
