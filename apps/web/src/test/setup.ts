import { afterEach, beforeEach, vi } from 'vitest'

import { TODAY } from './clock'
import { unexpectedLogs, watchConsole } from './console'
import { installMatchMedia, resetMedia } from './media'
import { resetNext } from './next'
import { routeReadsToHandler } from './reads'

// The fixtures are dated (sessions ahead, a planner offer tomorrow): every test runs on the
// same day, so what is ahead or past never changes with the calendar. Only `Date` is
// replaced; timers stay real.
beforeEach(() => {
  vi.setSystemTime(TODAY)
  watchConsole()
})

// Next's server modules only work inside a request; these stand in for them in every test.
// A test file can still replace one with its own `vi.mock`.

vi.mock('next/navigation', async () => {
  const { NotFoundError, RedirectError, route, router, subscribeRoute } = await import('./next')
  const { useSyncExternalStore } = await import('react')
  return {
    notFound: () => {
      throw new NotFoundError()
    },
    redirect: (url: string) => {
      throw new RedirectError(url)
    },
    usePathname: () => useSyncExternalStore(subscribeRoute, () => route.pathname),
    useSearchParams: () => new URLSearchParams(route.search),
    useRouter: () => router,
  }
})

vi.mock('next/headers', async () => {
  const { requestCookies, requestHeaders, responseCookies } = await import('./next')
  return {
    cookies: () =>
      Promise.resolve({
        get: (name: string) => {
          const value = requestCookies.get(name)
          return value === undefined ? undefined : { name, value }
        },
        set: (name: string, value: string, options?: unknown) => {
          responseCookies.push({ name, value, options })
        },
      }),
    headers: () => Promise.resolve({ get: (name: string) => requestHeaders.get(name) ?? null }),
  }
})

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
// Every request is within the rate limit unless a test says otherwise (rate-limit.test.ts
// tests the limit itself).
vi.mock('@/server/rate-limit', async importOriginal => ({
  ...(await importOriginal<object>()),
  spendRequest: vi.fn(() => Promise.resolve()),
}))

// Outside a request `connection()` throws; in tests every render is a request.
vi.mock('next/server', async importOriginal => ({
  ...(await importOriginal<object>()),
  connection: () => Promise.resolve(),
}))

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await import('next-intl')
  const { default: en } = await import('@/i18n/messages/en.json')
  return {
    getTranslations: (namespace?: string) =>
      Promise.resolve(createTranslator({ locale: 'en', messages: en, namespace } as never)),
    getLocale: () => Promise.resolve('en'),
    getMessages: () => Promise.resolve(en),
    // The request config is a plain async function in tests.
    getRequestConfig: <T>(factory: T) => factory,
  }
})

// jsdom lacks what Radix reaches for: the popper measures with ResizeObserver, Select uses
// pointer capture and scrolls the selected option into view.
if (typeof window !== 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {
      return undefined
    }
    unobserve() {
      return undefined
    }
    disconnect() {
      return undefined
    }
  }
  Object.assign(Element.prototype, {
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
    scrollIntoView: () => undefined,
  })
  installMatchMedia()
  routeReadsToHandler()
}

afterEach(async () => {
  vi.useRealTimers()
  resetNext()
  resetMedia()
  // Only jsdom tests render; node tests never load the DOM library.
  if (typeof document !== 'undefined') (await import('@testing-library/react')).cleanup()
  // Last, so a failing test is still cleaned up after (unmounting may log too).
  const logs = unexpectedLogs()
  if (logs.length > 0)
    throw new Error(`Logged, and the test did not expect it (expectLogged):\n${logs.join('\n')}`)
})
