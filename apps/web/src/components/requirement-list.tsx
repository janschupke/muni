import type { RequirementView } from '@muni/db/repositories'
import { useTranslations } from 'next-intl'
import { Fragment } from 'react'

import { RecordLink } from './archived'

const SCOPES = ['DEPARTMENT', 'POSITION'] as const

const hrefOf = (r: RequirementView) =>
  `/${r.scope === 'DEPARTMENT' ? 'departments' : 'positions'}/${r.targetId ?? ''}`

/**
 * Who must hold a course: everyone, or the departments and positions, each kind under its own
 * label with its records linking to their pages (muted once archived).
 */
export function RequirementList({ requirements }: { requirements: RequirementView[] }) {
  const t = useTranslations('status')
  if (requirements.length === 0) return <span className="text-fg-subtle">{t('optional')}</span>
  return (
    <ul className="flex flex-col gap-1">
      {requirements.some(r => r.scope === 'ALL') && <li>{t('scope.ALL')}</li>}
      {SCOPES.map(scope => {
        const targets = requirements.filter(r => r.scope === scope && r.targetId !== null)
        if (targets.length === 0) return null
        return (
          <li key={scope} className="flex flex-col">
            <span className="text-xs text-fg-muted">
              {t(`scope.${scope}`, { count: targets.length })}
            </span>
            <span>
              {targets.map((r, i) => (
                <Fragment key={r.targetId}>
                  {i > 0 && ' · '}
                  <RecordLink href={hrefOf(r)} archived={r.archived}>
                    {r.target}
                  </RecordLink>
                </Fragment>
              ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
