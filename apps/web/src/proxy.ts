import { clerkMiddleware } from '@clerk/nextjs/server'

/** Static files the app serves (icons, robots.txt, the manifest), public like the landing. */
const STATIC_FILE = /\/[^/]+\.(?:ico|png|svg|txt|xml|webmanifest)$/i

/**
 * The landing page, Clerk's pages and static files: everything else is a page of the
 * register, or a read under /api, and needs a signed-in user.
 */
export function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith('/api/')) return false
  return (
    pathname === '/' || /^\/(sign-in|sign-up)(\/|$)/.test(pathname) || STATIC_FILE.test(pathname)
  )
}

// The first line of defence: signed-out visitors are sent to sign-in before any page renders.
// Each page still checks for itself (requireReader / requireAdminPage) and every server action
// calls requireAdmin, so a route this misses is still protected.
export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicPath(request.nextUrl.pathname)) await auth.protect()
  },
  {
    // Without these, protect() sends visitors to Clerk's hosted pages instead of the app's.
    signInUrl: '/sign-in',
    signUpUrl: '/sign-up',
    // A Content-Security-Policy per request: scripts run only with its nonce (and what they
    // load: strict-dynamic), plus Clerk's own hosts. The page may not be framed.
    contentSecurityPolicy: {
      strict: true,
      directives: {
        'base-uri': ['self'],
        'object-src': ['none'],
        'frame-ancestors': ['none'],
        'img-src': ['data:'],
      },
    },
  }
)

export const config = {
  // Every request but Next's build output. Files go through too (they are public): a missing
  // one renders the not-found page, whose layout reads the session, which needs the middleware.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
