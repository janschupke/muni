import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedPositionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <ArchivedRecordPage kind="position" id={(await params).id} />
}
