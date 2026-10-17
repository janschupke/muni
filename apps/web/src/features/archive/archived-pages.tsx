import { recordExists } from '@muni/db/repositories'
import type { Archivable } from '@muni/domain/archive'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { requireAdminPage } from '@/server/auth'

import { ArchivedListView, ArchivedRecordView } from './archived-views'

// The archived records' pages, for admins only; their data is read in the browser
// (archived-views.tsx).

export async function archivedListMetadata(kind: Archivable) {
  return { title: (await getTranslations('archive.kinds'))(`${kind}.title`) }
}

export async function ArchivedListPage({ kind }: { kind: Archivable }) {
  await requireAdminPage()
  return <ArchivedListView kind={kind} />
}

export async function ArchivedRecordPage({ kind, id }: { kind: Archivable; id: string }) {
  await requireAdminPage()
  if (!(await recordExists(kind, id, { archived: true }))) notFound()
  return <ArchivedRecordView kind={kind} id={id} />
}
