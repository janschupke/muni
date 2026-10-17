import { TextLink } from '@muni/ui/text-link'
import { PLACEHOLDER } from '@muni/utils/format'

/** An email address shown in full: a link that opens a message to it; none is the placeholder. */
export function EmailLink({ email }: { email: string | null | undefined }) {
  if (!email) return PLACEHOLDER
  return (
    <TextLink href={`mailto:${email}`} className="break-all">
      {email}
    </TextLink>
  )
}
