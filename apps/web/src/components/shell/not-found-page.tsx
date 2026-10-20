import { type Entity, NotFoundMessage } from './not-found-message'

// Not a client module: the route files call this on the server; the message it renders is
// the client part.

/** A record route's not-found page: which record is missing, and the way to its list. */
export function notFoundOf(entity: Entity) {
  return function NotFound() {
    return <NotFoundMessage entity={entity} />
  }
}
