import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'
import Link from 'next/link'

/** A department or position by name, linking to its page; a dash when there is none. */
export function OrgLink({
  kind,
  id,
  name,
}: {
  kind: 'departments' | 'positions'
  id: string | null
  name: string | null
}) {
  if (id === null || name === null) return PLACEHOLDER
  return (
    <TextLink asChild hitArea>
      <Link href={`/${kind}/${id}`}>{name}</Link>
    </TextLink>
  )
}
