// The session planner: new sessions for the trainings the advisor cannot place, each with a
// slot, a room and a provider (`planSessions`), grouped by course for the page (`groupOffers`).
export { type CourseOffering, proposedOffering } from './offering'
export { groupOffers, planSessions } from './plan'
export * from './types'
