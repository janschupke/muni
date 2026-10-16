/**
 * Auth is on when Clerk keys are configured. Without them (fresh clone, CI) the site serves
 * the public read-only register, hides sign-in, and the edit/import routes return 404.
 * Get development keys from the Clerk dashboard or with `npx clerk@latest init`.
 */
export const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
