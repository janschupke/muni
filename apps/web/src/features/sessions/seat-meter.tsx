import { BarRow } from '@muni/ui/bar-row'
import { Meter } from '@muni/ui/meter'

import { OccupancyBadge, seatTone } from '@/components/badges/status-badges'
import { useOfTotal } from '@/lib/format/use-of-total'

/**
 * A session's seats: booked of capacity as a bar toned by how full it is, "12 of 20" beside
 * it, and a badge once it is nearly full, full or over.
 */
export function SeatMeter({
  booked,
  capacity,
  label,
  badge = true,
}: {
  booked: number
  capacity: number
  /** The bar's accessible name. */
  label: string
  badge?: boolean | undefined
}) {
  const ofTotal = useOfTotal()
  return (
    <BarRow
      layout="inline"
      barClassName="w-20 flex-none"
      bar={<Meter value={booked} max={capacity} label={label} tone={seatTone(booked, capacity)} />}
      value={ofTotal(booked, capacity)}
      after={badge && <OccupancyBadge booked={booked} capacity={capacity} />}
    />
  )
}
