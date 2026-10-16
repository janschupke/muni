import type { ComplianceStatus, EmploymentStatus, SessionStatus } from '@muni/domain/enums'
import { Badge, type BadgeTone } from '@muni/ui/badge'
import { AlertTriangle, CircleCheck, CircleSlash, CircleX, Clock } from 'lucide-react'
import { getTranslations } from 'next-intl/server'

// Status colours always come with an icon and a label, never colour alone.
const COMPLIANCE: Record<ComplianceStatus, { tone: BadgeTone; Icon: typeof CircleCheck }> = {
  VALID: { tone: 'success', Icon: CircleCheck },
  EXPIRING: { tone: 'warning', Icon: Clock },
  EXPIRED: { tone: 'serious', Icon: AlertTriangle },
  MISSING: { tone: 'danger', Icon: CircleX },
}

export const COMPLIANCE_FILL: Record<ComplianceStatus, string> = {
  VALID: 'bg-status-valid',
  EXPIRING: 'bg-status-expiring',
  EXPIRED: 'bg-status-expired',
  MISSING: 'bg-status-missing',
}

export async function ComplianceBadge({ status }: { status: ComplianceStatus | null }) {
  const t = await getTranslations('status')
  if (status === null) {
    return (
      <Badge tone="neutral">
        <CircleSlash aria-hidden />
        {t('nothingRequired')}
      </Badge>
    )
  }
  const { tone, Icon } = COMPLIANCE[status]
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(`compliance.${status}`)}
    </Badge>
  )
}

const EMPLOYMENT: Record<EmploymentStatus, BadgeTone> = {
  ACTIVE: 'success',
  PARENTAL_LEAVE: 'accent',
  TERMINATED: 'neutral',
}

export async function EmploymentBadge({ status }: { status: EmploymentStatus }) {
  const t = await getTranslations('status.employment')
  return <Badge tone={EMPLOYMENT[status]}>{t(status)}</Badge>
}

export async function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = await getTranslations('status.session')
  return <Badge tone={status === 'CANCELLED' ? 'neutral' : 'accent'}>{t(status)}</Badge>
}
