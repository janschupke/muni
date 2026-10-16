import type { RequirementView } from '@muni/db/repositories'
import { TextLink } from '@muni/ui/text-link'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

const hrefOf = (r: RequirementView) =>
  r.targetId === null
    ? null
    : `/${r.scope === 'DEPARTMENT' ? 'departments' : 'positions'}/${r.targetId}`

/** Who must hold a course; departments and positions link to their pages. */
export function RequirementList({ requirements }: { requirements: RequirementView[] }) {
  const t = useTranslations('status')
  if (requirements.length === 0) return <span className="text-fg-subtle">{t('optional')}</span>
  return (
    <ul className="flex flex-col gap-0.5">
      {requirements.map(r => {
        const href = hrefOf(r)
        return (
          <li key={`${r.scope}|${r.targetId ?? ''}`}>
            {t.rich(`scope.${r.scope}`, {
              target: r.target ?? '',
              link: chunks =>
                href ? (
                  <TextLink asChild>
                    <Link href={href}>{chunks}</Link>
                  </TextLink>
                ) : (
                  chunks
                ),
            })}
          </li>
        )
      })}
    </ul>
  )
}
