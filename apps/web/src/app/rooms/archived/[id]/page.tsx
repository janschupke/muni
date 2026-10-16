import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedRoomPage({ params }: { params: Promise<{ id: string }> }) {
  return <ArchivedRecordPage kind="room" id={(await params).id} />
}
