import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedDepartmentPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  return <ArchivedRecordPage kind="department" id={(await params).id} />
}
