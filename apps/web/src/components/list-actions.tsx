import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { Plus } from 'lucide-react'
import Link from 'next/link'

import { ArchivedListLink } from '@/features/archive/archived-pages'

/** A list's header actions for admins: its archived records, and a new record when it has one. */
export function ListActions({
  kind,
  create,
}: {
  kind: Archivable
  create?: { href: string; label: string } | undefined
}) {
  return (
    <>
      <ArchivedListLink kind={kind} />
      {create && (
        <Button asChild variant="primary">
          <Link href={create.href}>
            <Plus aria-hidden />
            {create.label}
          </Link>
        </Button>
      )}
    </>
  )
}
