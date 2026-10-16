import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('position')

export default function ArchivedPositionsPage() {
  return <ArchivedListPage kind="position" />
}
