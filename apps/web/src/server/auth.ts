import 'server-only'

import { auth } from '@clerk/nextjs/server'
import type { Viewer } from '@muni/domain/enums'
import { notFound } from 'next/navigation'

import { clerkEnabled } from './clerk'

/** Anonymous visitors get the read-only site; any signed-in user may edit and import. */
export async function getViewer(): Promise<Viewer> {
  if (!clerkEnabled) return 'anonymous'
  const { userId } = await auth()
  return userId ? 'authenticated' : 'anonymous'
}

/** For protected pages: redirects to sign-in when signed out; 404 when auth is not configured. */
export async function requirePageUser(): Promise<string> {
  if (!clerkEnabled) notFound()
  const { userId } = await auth.protect()
  return userId
}

class UnauthorizedError extends Error {
  override name = 'UnauthorizedError'
}

/**
 * Guards every mutation. Server actions are plain POSTs that can target any route,
 * so each one checks on its own, whatever page rendered the form.
 */
export async function requireUser(): Promise<string> {
  if (!clerkEnabled) throw new UnauthorizedError()
  const { userId } = await auth()
  if (!userId) throw new UnauthorizedError()
  return userId
}
