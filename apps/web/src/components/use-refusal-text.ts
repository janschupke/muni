'use client'

import type { Archivable } from '@muni/domain/archive'
import { useTranslations } from 'next-intl'

import type { ArchiveState } from '@/lib/form'

/** Why an archive or unarchive did not happen, as a sentence for this kind of record. */
export function useRefusalText(kind: Archivable) {
  const t = useTranslations('archive')
  return (state: Extract<ArchiveState, { status: 'refused' }>) =>
    t(`refused.${state.reason}`, {
      kind,
      count: state.count ?? 0,
      fields: (state.fields ?? []).map(field => t(`fields.${field}`)).join(', '),
    })
}
