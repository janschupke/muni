import { ArchivedRecordPage } from '@/features/archive/archived-pages'

export default async function ArchivedCoursePage({ params }: { params: Promise<{ id: string }> }) {
  return <ArchivedRecordPage kind="course" id={(await params).id} />
}
