import type { ComplianceStatus, EmploymentStatus, SessionStatus } from '@muni/domain/enums'
import { Badge, type BadgeTone } from '@muni/ui/badge'
import {
  Baby,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  TriangleAlert,
  UserCheck,
  UserX,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

// Status colours always come with an icon and a label, never colour alone.
// These use `useTranslations`, so they render both in server components and in client tables.

const COMPLIANCE: Record<ComplianceStatus, { tone: BadgeTone; Icon: LucideIcon }> = {
  VALID: { tone: 'success', Icon: CircleCheck },
  EXPIRING: { tone: 'warning', Icon: Clock },
  EXPIRED: { tone: 'serious', Icon: TriangleAlert },
  MISSING: { tone: 'danger', Icon: CircleX },
}

export const COMPLIANCE_FILL: Record<ComplianceStatus, string> = {
  VALID: 'bg-status-valid',
  EXPIRING: 'bg-status-expiring',
  EXPIRED: 'bg-status-expired',
  MISSING: 'bg-status-missing',
}

export function ComplianceBadge({ status }: { status: ComplianceStatus | null }) {
  const t = useTranslations('status')
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

const EMPLOYMENT: Record<EmploymentStatus, { tone: BadgeTone; Icon: LucideIcon }> = {
  ACTIVE: { tone: 'success', Icon: UserCheck },
  PARENTAL_LEAVE: { tone: 'accent', Icon: Baby },
  TERMINATED: { tone: 'neutral', Icon: UserX },
}

export function EmploymentBadge({ status }: { status: EmploymentStatus }) {
  const t = useTranslations('status.employment')
  const { tone, Icon } = EMPLOYMENT[status]
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  )
}

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const t = useTranslations('status.session')
  const Icon = status === 'CANCELLED' ? CalendarX : CalendarCheck
  return (
    <Badge tone={status === 'CANCELLED' ? 'neutral' : 'accent'}>
      <Icon aria-hidden />
      {t(status)}
    </Badge>
  )
}

/** Over capacity, or exactly full; nothing otherwise. */
export function OccupancyBadge({ booked, capacity }: { booked: number; capacity: number }) {
  const t = useTranslations('sessions')
  if (booked > capacity) {
    return (
      <Badge tone="danger">
        <TriangleAlert aria-hidden />
        {t('overbooked')}
      </Badge>
    )
  }
  if (capacity > 0 && booked === capacity) {
    return (
      <Badge tone="neutral">
        <Users aria-hidden />
        {t('full')}
      </Badge>
    )
  }
  return null
}
