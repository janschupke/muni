import type { Archivable } from '@muni/domain/archive'
import { Button } from '@muni/ui/button'
import { EmptyState } from '@muni/ui/empty-state'
import { Plus } from 'lucide-react'

import { Link } from '@/components/navigation/link'
import { ArchivedListLink } from '@/features/archive/archived-list-link'

/** A list's new record: where it is made, and the button's label. */
export interface Create {
  href: string
  label: string
}

function CreateButton({ create }: { create: Create }) {
  return (
    <Button asChild variant="primary">
      <Link href={create.href}>
        <Plus aria-hidden />
        {create.label}
      </Link>
    </Button>
  )
}

/** A list's header actions for admins: its archived records, and a new record when it has one. */
export function ListActions({ kind, create }: { kind: Archivable; create?: Create | undefined }) {
  return (
    <>
      <ArchivedListLink kind={kind} />
      {create && <CreateButton create={create} />}
    </>
  )
}

/**
 * A list with nothing in it, in place of its table: what is missing and, for whoever can
 * edit, the way to create the first one.
 */
export function ListEmpty({ title, create }: { title: string; create?: Create | undefined }) {
  return <EmptyState title={title} action={create && <CreateButton create={create} />} />
}
