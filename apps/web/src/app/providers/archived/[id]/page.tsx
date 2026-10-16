import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedProviderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <ArchivedRecordPage kind="provider" id={(await params).id} />
}
