import type { RequirementView } from '@muni/db/repositories'
import { useTranslations } from 'next-intl'

import { RecordLink } from './archived'

const hrefOf = (r: RequirementView) =>
  r.targetId === null
    ? null
    : `/${r.scope === 'DEPARTMENT' ? 'departments' : 'positions'}/${r.targetId}`

/** Who must hold a course; departments and positions link to their pages (muted once archived). */
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
                  <RecordLink href={href} archived={r.archived} inText>
                    {chunks}
                  </RecordLink>
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
