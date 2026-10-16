import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedCompletionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <ArchivedRecordPage kind="completion" id={(await params).id} />
}
