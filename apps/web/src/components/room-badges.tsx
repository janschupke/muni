import type { Capability, RoomKind } from '@muni/domain/enums'
import { Badge } from '@muni/ui/badge'
import {
  Accessibility,
  Building2,
  Car,
  Check,
  Construction,
  FlaskConical,
  Monitor,
  Projector,
  School,
  Trees,
  Video,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useTranslations } from 'next-intl'

const KIND_ICON: Record<RoomKind, LucideIcon> = {
  CLASSROOM: School,
  LAB: FlaskConical,
  ONLINE: Wifi,
  EXTERNAL: Building2,
  OUTDOOR: Trees,
}

const CAPABILITY_ICON: Record<Capability, LucideIcon> = {
  PROJECTOR: Projector,
  COMPUTERS: Monitor,
  LAB_EQUIPMENT: FlaskConical,
  VEHICLE: Car,
  PRACTICAL_AREA: Construction,
  VIDEO_CONFERENCE: Video,
  WHEELCHAIR_ACCESS: Accessibility,
}

export function RoomKindBadge({ kind }: { kind: RoomKind }) {
  const t = useTranslations('status.roomKind')
  const Icon = KIND_ICON[kind]
  return (
    <Badge>
      <Icon aria-hidden />
      {t(kind)}
    </Badge>
  )
}

/** A room's equipment, or a course's needs, as labelled chips. */
export function CapabilityList({
  capabilities,
  empty,
}: {
  capabilities: readonly Capability[]
  empty?: string
}) {
  const t = useTranslations('status.capability')
  if (capabilities.length === 0)
    return empty ? <span className="text-fg-subtle">{empty}</span> : null
  return (
    <ul className="flex flex-wrap gap-1">
      {capabilities.map(c => {
        const Icon = CAPABILITY_ICON[c]
        return (
          <li key={c}>
            <Badge>
              <Icon aria-hidden />
              {t(c)}
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * What a course needs, each item marked as one this room has or lacks: by tone, by a tick or
 * a cross, and in words for screen readers.
 */
export function CapabilityFitList({
  needed,
  missing,
  empty,
}: {
  needed: readonly Capability[]
  missing: readonly Capability[]
  empty: string
}) {
  const t = useTranslations('status.capability')
  const tf = useTranslations('rooms.detail.fit')
  if (needed.length === 0) return <span className="text-fg-subtle">{empty}</span>
  return (
    <ul className="flex flex-wrap gap-1">
      {needed.map(c => {
        const Icon = CAPABILITY_ICON[c]
        const lacking = missing.includes(c)
        const Mark = lacking ? X : Check
        return (
          <li key={c}>
            <Badge tone={lacking ? 'danger' : 'success'}>
              <Icon aria-hidden />
              {t(c)}
              <Mark aria-hidden />
              <span className="sr-only"> {lacking ? tf('lacks') : tf('has')}</span>
            </Badge>
          </li>
        )
      })}
    </ul>
  )
}
