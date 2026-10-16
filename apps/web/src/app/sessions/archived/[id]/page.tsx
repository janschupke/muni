import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedSessionPage({ params }: { params: Promise<{ id: string }> }) {
  return <ArchivedRecordPage kind="session" id={(await params).id} />
}
