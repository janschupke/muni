/** Booked share at which a session counts as nearly full (and is shown in yellow). */
export const NEARLY_FULL_RATIO = 0.8

export const OCCUPANCIES = ['OPEN', 'NEARLY_FULL', 'FULL', 'OVERBOOKED'] as const
export type Occupancy = (typeof OCCUPANCIES)[number]

/** How booked a session is. A session without seats (capacity 0) is only ever overbooked. */
export function occupancy(booked: number, capacity: number): Occupancy {
  if (booked > capacity) return 'OVERBOOKED'
  if (capacity === 0) return 'OPEN'
  if (booked === capacity) return 'FULL'
  if (booked / capacity >= NEARLY_FULL_RATIO) return 'NEARLY_FULL'
  return 'OPEN'
}
