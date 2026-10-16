import { vi } from 'vitest'

/**
 * What the mocked Next modules (see `setup.ts`) read and record: the current route for the
 * navigation hooks, the router's calls, and the request's cookies and headers. Reset after
 * every test.
 */
export const route = { pathname: '/', search: '' }

const routeListeners = new Set<() => void>()

/** For the mocked `usePathname`: components re-render when the route changes, as in Next. */
export function subscribeRoute(listener: () => void) {
  routeListeners.add(listener)
  return () => {
    routeListeners.delete(listener)
  }
}

/** Moves to another route without a click (the back button, a redirect). */
export function navigate(pathname: string) {
  route.pathname = pathname
  for (const listener of routeListeners) listener()
}
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}
export const requestCookies = new Map<string, string>()
export const requestHeaders = new Map<string, string>()
export const responseCookies: { name: string; value: string; options?: unknown }[] = []

/** What `notFound()` throws; Next renders the not-found page for it. */
export class NotFoundError extends Error {
  override name = 'NotFoundError'
}

/** What `redirect()` throws, with its target. */
export class RedirectError extends Error {
  override name = 'RedirectError'
  constructor(readonly url: string) {
    super(`Redirect to ${url}`)
  }
}

export function resetNext() {
  route.pathname = '/'
  route.search = ''
  for (const fn of Object.values(router)) fn.mockReset()
  requestCookies.clear()
  requestHeaders.clear()
  responseCookies.length = 0
}
