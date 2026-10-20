import { describe, expect, it, vi } from 'vitest'

import getRequestConfig from '@/i18n/request'
import { requestCookies, requestHeaders, responseCookies } from '@/test/next'
import { serverSession } from '@/test/server'

import { setLocale } from './locale'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))

vi.mock('@muni/db/repositories', async () =>
  (await import('@/test/repositories-mock')).repositoriesMock()
)

vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))

vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))

vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

serverSession()

describe('locale', () => {
  it('stores a supported language for a year and ignores anything else', async () => {
    await setLocale('xx')
    expect(responseCookies).toEqual([])
    await setLocale('en')
    expect(responseCookies).toEqual([
      {
        name: 'NEXT_LOCALE',
        value: 'en',
        options: { path: '/', maxAge: 31_536_000, sameSite: 'lax' },
      },
    ])
  })

  it('resolves the request language from the cookie, then the browser, then Czech', async () => {
    const config = getRequestConfig as unknown as () => Promise<{
      locale: string
      timeZone: string
    }>
    expect((await config()).locale).toBe('cs')
    requestHeaders.set('accept-language', 'en-GB,en;q=0.9')
    expect(await config()).toMatchObject({ locale: 'en', timeZone: 'Europe/Prague' })
    requestCookies.set('NEXT_LOCALE', 'cs')
    expect((await config()).locale).toBe('cs')
  })
})
