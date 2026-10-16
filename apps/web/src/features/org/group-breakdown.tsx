import { TextLink } from '@muni/ui/text-link'
import { formatInteger } from '@muni/utils/format'
import Link from 'next/link'
import { useLocale } from 'next-intl'

/** How many people of a group hold each position (or sit in each department), linked. */
export function GroupBreakdown({
  kind,
  groups,
}: {
  kind: 'departments' | 'positions'
  groups: readonly { id: string; name: string; count: number }[]
}) {
  const locale = useLocale()
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {groups.map(g => (
        <li key={g.id} className="inline-flex items-baseline gap-1.5">
          <TextLink asChild>
            <Link href={`/${kind}/${g.id}`} className="inline-flex min-h-6 items-center">
              {g.name}
            </Link>
          </TextLink>
          <span className="text-fg-muted tabular-nums">{formatInteger(g.count, locale)}</span>
        </li>
      ))}
    </ul>
  )
}
