import type { Archivable } from '@muni/domain/archive'
import { getTranslations } from 'next-intl/server'

import { ARCHIVED_SORT } from '@/lib/list-keys'
import { parseList, type SearchParams } from '@/lib/search-params'
import { requireAdminPage } from '@/server/auth'
import { prefetched } from '@/server/prefetch'

import { ArchivedListView, ArchivedRecordView } from './archived-views'

// The archived records' pages, for admins only; their data is read on the server and handed
// to the views (archived-views.tsx), which keep it fresh in the browser.

export async function archivedListMetadata(kind: Archivable) {
  return { title: (await getTranslations('archive.kinds'))(`${kind}.title`) }
}

export async function ArchivedListPage({
  kind,
  searchParams,
}: {
  kind: Archivable
  searchParams: SearchParams
}) {
  const user = await requireAdminPage()
  return prefetched(
    user,
    [{ name: 'archived-list', input: { kind, ...parseList(await searchParams, ARCHIVED_SORT) } }],
    <ArchivedListView kind={kind} />
  )
}

export async function ArchivedRecordPage({ kind, id }: { kind: Archivable; id: string }) {
  const user = await requireAdminPage()
  return prefetched(
    user,
    [{ name: 'archived-record', input: { kind, id } }],
    <ArchivedRecordView kind={kind} id={id} />
  )
}
