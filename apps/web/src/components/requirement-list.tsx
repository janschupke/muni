import type { RequirementView } from '@muni/db/repositories'
import { getTranslations } from 'next-intl/server'

export async function RequirementList({ requirements }: { requirements: RequirementView[] }) {
  const t = await getTranslations('status')
  if (requirements.length === 0) return <span className="text-fg-subtle">{t('optional')}</span>
  return (
    <ul className="flex flex-col gap-0.5">
      {requirements.map(r => (
        <li key={`${r.scope}|${r.target ?? ''}`}>
          {t(`scope.${r.scope}`, { target: r.target ?? '' })}
        </li>
      ))}
    </ul>
  )
}
