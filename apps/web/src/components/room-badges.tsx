import type { Capability, RoomKind } from '@muni/domain/enums'
import { Badge } from '@muni/ui/badge'
import {
  Accessibility,
  Building2,
  Car,
  Construction,
  FlaskConical,
  Monitor,
  Projector,
  School,
  Trees,
  Video,
  Wifi,
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
