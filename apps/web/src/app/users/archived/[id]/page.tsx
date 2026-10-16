import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedUserPage({ params }: { params: Promise<{ id: string }> }) {
  return <ArchivedRecordPage kind="user" id={(await params).id} />
}
