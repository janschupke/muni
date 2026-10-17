import { recordExists } from '@muni/db/repositories'
import { notFound } from 'next/navigation'

import { PositionFormView } from '@/features/org/group-form-views'
import { requireAdminPage } from '@/server/auth'

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage()
  const { id } = await params
  if (!(await recordExists('position', id))) notFound()
  return <PositionFormView id={id} />
}
