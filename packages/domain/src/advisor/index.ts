// The advisor: what is non-compliant now, what becomes non-compliant month by month, what is
// already being remedied (a named booking), and who should go to which session for the rest.
//
// One fixed rule, no weights: the most overdue training is served first and takes the earliest
// session that can take it (or, for one that has not lapsed yet, the last session that still
// ends in time). Same input, same plan: input order never matters.
export {
  BOOKING_BLOCKS,
  type BookingBlock,
  type BookingQuery,
  type BookingState,
  bookingState,
  countBookable,
  itemsToBook,
  PERSON_BOOKING_BLOCKS,
  type PersonBookingBlock,
  personBookingState,
  summarizeBookings,
} from './booking'
export { type AdvisorTableView, needsNewSession, tableItems, upcomingRow } from './breakdown'
export { forecastEnd, forecastMonths, inForecast } from './forecast'
export { checkMoves } from './overbooking'
export { planAssignments } from './plan'
export { pack, type Packed, unpack } from './transport'
export * from './types'
