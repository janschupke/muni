import { clerkMiddleware } from '@clerk/nextjs/server'

/** The landing page and Clerk's own pages; everything else needs a signed-in user. */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/' || /^\/(sign-in|sign-up)(\/|$)/.test(pathname)
}

// The first line of defence: signed-out visitors are sent to sign-in before any page renders.
// Each page still checks for itself (requireReader / requireAdminPage) and every server action
// calls requireAdmin, so a route this misses is still protected.
export default clerkMiddleware(async (auth, request) => {
  if (!isPublicPath(request.nextUrl.pathname)) await auth.protect()
})

export const config = {
  matcher: [
    // Skip Next internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt)).*)',
    '/(api|trpc)(.*)',
  ],
}
