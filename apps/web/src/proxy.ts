import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

import { clerkEnabled } from './server/clerk'

// Attaches the Clerk session to requests. Access control is not path-based: every protected
// page calls requirePageUser() and every server action calls requireUser().
export default clerkEnabled ? clerkMiddleware() : () => NextResponse.next()

export const config = {
  matcher: [
    // Skip Next internals and static files.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt)).*)',
    '/(api|trpc)(.*)',
  ],
}
