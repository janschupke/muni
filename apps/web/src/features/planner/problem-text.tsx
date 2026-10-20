'use client'

import { PLAN_HORIZON_DAYS, type SessionOffer } from '@muni/domain/planner'
import { TriangleAlert } from 'lucide-react'
import { useTranslations } from 'next-intl'

export function ProblemText({ offer }: { offer: SessionOffer }) {
  const t = useTranslations('planner.problems')
  const tc = useTranslations('status.capability')
  const problem = offer.problem ?? { kind: 'NO_FREE_SLOT' }
  let text: string
  switch (problem.kind) {
    case 'NO_ROOM_WITH':
      text = t('NO_ROOM_WITH', { missing: problem.missing.map(c => tc(c)).join(', ') })
      break
    case 'NO_ROOM_LARGE_ENOUGH':
      text = t('NO_ROOM_LARGE_ENOUGH', { size: offer.size, largest: problem.largest })
      break
    case 'NO_FREE_SLOT':
      text = t('NO_FREE_SLOT', { days: PLAN_HORIZON_DAYS })
      break
    default:
      text = t(problem.kind)
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-danger-fg">
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      {text}
    </span>
  )
}
