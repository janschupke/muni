import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <ArchivedRecordPage kind="employee" id={(await params).id} />
}
