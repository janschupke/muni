import { clerkMiddleware } from '@clerk/nextjs/server'
import { describe, expect, it, vi } from 'vitest'

import { serverSession } from '@/test/server'

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

describe('proxy', () => {
  it('sends visitors to sign-in everywhere but the home page and Clerk’s pages', async () => {
    const { default: handler, config, isPublicPath } = await import('@/proxy')
    expect(config.matcher).toEqual(['/((?!_next/static|_next/image).*)'])
    // To the app's own sign-in page, not Clerk's hosted one.
    expect(clerkMiddleware).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        signInUrl: '/sign-in',
        signUpUrl: '/sign-up',
        // A nonce-based policy, and no framing.
        contentSecurityPolicy: expect.objectContaining({
          strict: true,
          directives: expect.objectContaining({ 'frame-ancestors': ['none'] }) as object,
        }) as object,
      })
    )
    const protect = vi.fn()
    const run = (pathname: string) =>
      (handler as unknown as (auth: unknown, request: unknown) => Promise<void>)(
        { protect },
        { nextUrl: { pathname } }
      )
    for (const path of [
      '/',
      '/sign-in',
      '/sign-in/factor-one',
      '/sign-up',
      '/robots.txt',
      '/icon.svg',
      '/missing.png',
    ]) {
      expect(isPublicPath(path), path).toBe(true)
      await run(path)
    }
    expect(protect).not.toHaveBeenCalled()
    for (const path of [
      '/employees',
      '/users',
      '/sign-inx',
      '/signup',
      '/employees/E0001',
      // Reads are never public, whatever their name ends in; nor is a record with a dot.
      '/api/read/employees.json',
      '/employees/E0001.pdf',
    ]) {
      expect(isPublicPath(path), path).toBe(false)
      await run(path)
    }
    expect(protect).toHaveBeenCalledTimes(7)
  })
})
