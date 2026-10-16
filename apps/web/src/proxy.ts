import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * The landing page, Clerk's pages and files (icons, robots.txt): everything else is a page
 * of the register and needs a signed-in user. No register page has an extension in its path.
 */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === '/' ||
    /^\/(sign-in|sign-up)(\/|$)/.test(pathname) ||
    /\/[^/]+\.[a-z0-9]+$/i.test(pathname)
  )
}

// The first line of defence: signed-out visitors are sent to sign-in before any page renders.
// Each page still checks for itself (requireReader / requireAdminPage) and every server action
// calls requireAdmin, so a route this misses is still protected.
export default clerkMiddleware(
  async (auth, request) => {
    if (!isPublicPath(request.nextUrl.pathname)) await auth.protect()
  },
  // Without these, protect() sends visitors to Clerk's hosted pages instead of the app's.
  { signInUrl: '/sign-in', signUpUrl: '/sign-up' }
)

export const config = {
  // Every request but Next's build output. Files go through too (they are public): a missing
  // one renders the not-found page, whose layout reads the session, which needs the middleware.
  matcher: ['/((?!_next/static|_next/image).*)'],
}
