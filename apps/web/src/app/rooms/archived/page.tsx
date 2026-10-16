import { archivedListMetadata, ArchivedListPage } from '@/features/archive/archived-pages'

export const generateMetadata = () => archivedListMetadata('room')

export default function ArchivedRoomsPage() {
  return <ArchivedListPage kind="room" />
}
