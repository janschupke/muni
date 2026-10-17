import { type ComplianceBand, complianceBand } from '@muni/domain/compliance'
import type { ComplianceStatus, EmploymentState, SessionStatus } from '@muni/domain/enums'
import { type Occupancy, occupancy } from '@muni/domain/sessions'
import { Badge, type BadgeTone } from '@muni/ui/badge'
import type { MeterTone } from '@muni/ui/meter'
import {
  Baby,
  CalendarCheck,
  CalendarX,
  CircleCheck,
  CircleSlash,
  CircleX,
  Clock,
  type LucideIcon,
  TriangleAlert,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

// Status colours always come with an icon and a label, never colour alone.
// These use `useTranslations`, so they render both in server components and in client tables.

export const COMPLIANCE: Record<ComplianceStatus, { tone: BadgeTone; Icon: LucideIcon }> = {
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

const EMPLOYMENT: Record<EmploymentState, { tone: BadgeTone; Icon: LucideIcon }> = {
  ACTIVE: { tone: 'success', Icon: UserCheck },
  PARENTAL_LEAVE: { tone: 'accent', Icon: Baby },
  LEFT: { tone: 'neutral', Icon: UserX },
}

export function EmploymentBadge({ status }: { status: EmploymentState }) {
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

// A rate in the matrix's colours: green (held), yellow (slipping), orange, red (action
// needed). The rate is always printed too.
const BAND_TONE: Record<ComplianceBand, 'success' | 'warning' | 'serious' | 'danger'> = {
  FULL: 'success',
  HIGH: 'success',
  FAIR: 'warning',
  LOW: 'serious',
  POOR: 'danger',
}

/** The signal tone of a share of required trainings held (meters, the overview card). */
export const rateTone = (rate: number) => BAND_TONE[complianceBand(rate)]

const OCCUPANCY: Record<
  Exclude<Occupancy, 'OPEN'>,
  { tone: BadgeTone; Icon: LucideIcon; key: 'nearlyFull' | 'full' | 'overbooked' }
> = {
  NEARLY_FULL: { tone: 'warning', Icon: Users, key: 'nearlyFull' },
  FULL: { tone: 'warning', Icon: Users, key: 'full' },
  OVERBOOKED: { tone: 'danger', Icon: TriangleAlert, key: 'overbooked' },
}

/** Seat meter colour: brand blue while there is room, yellow when (nearly) full, red over. */
export function seatTone(booked: number, capacity: number): MeterTone {
  const state = occupancy(booked, capacity)
  return state === 'OPEN' ? 'accent' : state === 'OVERBOOKED' ? 'danger' : 'warning'
}

/** Nearly full, full or over capacity; nothing while there is room. */
export function OccupancyBadge({ booked, capacity }: { booked: number; capacity: number }) {
  const t = useTranslations('sessions')
  const state = occupancy(booked, capacity)
  if (state === 'OPEN') return null
  const { tone, Icon, key } = OCCUPANCY[state]
  return (
    <Badge tone={tone}>
      <Icon aria-hidden />
      {t(key)}
    </Badge>
  )
}
