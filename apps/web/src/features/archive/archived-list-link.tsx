import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { Archive } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

import { archivedListPath } from './paths'

/** The list header's way to the archived records of its kind (admins only). */
export function ArchivedListLink({ kind }: { kind: Archivable }) {
  const t = useTranslations('archive.list')
  return (
    <Button asChild variant="ghost">
      <Link href={archivedListPath(kind)}>
        <Archive aria-hidden />
        {t('show')}
      </Link>
    </Button>
  )
}
