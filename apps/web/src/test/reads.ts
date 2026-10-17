import { vi } from 'vitest'

/**
 * In tests the browser's reads (`fetch('/api/read/…')`) go straight to the server's handler,
 * so a page test runs the same guard and load the real route does, against the test file's
 * mocked repositories and session.
 */
export function routeReadsToHandler(): void {
  vi.stubGlobal('fetch', async (resource: string | URL | Request) => {
    const href =
      typeof resource === 'string'
        ? resource
        : resource instanceof URL
          ? resource.href
          : resource.url
    const url = new URL(href, 'http://localhost')
    const [, name] = /^\/api\/read\/([^/]+)$/.exec(url.pathname) ?? []
    if (!name) throw new Error(`no fetch outside reads in tests: ${href}`)
    const { handleRead } = await import('@/server/reads/handle')
    return handleRead(name, url.searchParams)
  })
}
