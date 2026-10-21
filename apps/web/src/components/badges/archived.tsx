import type { PersonRef, UserRef } from '@muni/domain/archive'
import { Badge } from '@muni/ui/badge'
import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import { Archive } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { Link } from '@/components/navigation/link'

// How archived records appear where other records still point to them: muted, with an archive
// mark, and never a link (their pages are for admins, from the archived lists).

/** An archived record's name: muted, marked, not linked; screen readers hear "archived". */
function ArchivedName({ children }: { children: ReactNode }) {
  const t = useTranslations('archive')
  return (
    <span className="inline-flex min-h-6 items-center gap-1 text-fg-muted">
      <Archive aria-hidden className="size-3.5 shrink-0" />
      {children}
      <span className="sr-only"> ({t('archived')})</span>
    </span>
  )
}

/** A link to a record, or (once archived) its muted, unlinked name. */
export function RecordLink({
  href,
  archived,
  emphasis = false,
  children,
}: {
  href: string
  archived: boolean
  emphasis?: boolean | undefined
  children: ReactNode
}) {
  if (archived) return <ArchivedName>{children}</ArchivedName>
  return (
    <TextLink asChild emphasis={emphasis} hitArea>
      <Link href={href}>{children}</Link>
    </TextLink>
  )
}

/** "Archived" next to a record's title or in a list row. */
export function ArchivedBadge() {
  const t = useTranslations('archive')
  return (
    <Badge>
      <Archive aria-hidden />
      {t('badge')}
    </Badge>
  )
}

/**
 * A person as another record names them: their name, linking to their record; once archived,
 * only a tag ("Archived employee #a1b2c3"), whoever is looking.
 */
export function PersonLink({
  person,
  emphasis = false,
}: {
  person: PersonRef
  emphasis?: boolean | undefined
}) {
  const t = useTranslations('archive')
  if (person.archived) return <ArchivedName>{t('person', { tag: person.tag })}</ArchivedName>
  return (
    <TextLink asChild emphasis={emphasis} hitArea>
      <Link href={`/employees/${person.externalId}`}>{person.name}</Link>
    </TextLink>
  )
}

/** Sorting and searching text for a person reference (a tag sorts after names). */
export const personText = (person: PersonRef) => (person.archived ? `~${person.tag}` : person.name)

/** An app user as a record names them (who archived it): name or email, or a tag once archived. */
export function UserName({ user }: { user: UserRef }) {
  const t = useTranslations('archive')
  if (user.archived) return <ArchivedName>{t('user', { tag: user.tag })}</ArchivedName>
  return <>{user.name ?? user.email ?? PLACEHOLDER}</>
}
