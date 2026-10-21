// Every environment variable the code reads, typed once for the whole monorepo. Each
// package's tsconfig includes this file. Reading one not listed here is a type error
// (noPropertyAccessFromIndexSignature), so a misspelled name cannot pass silently.

declare namespace NodeJS {
  interface ProcessEnv {
    /** Postgres; on Vercel, Supabase's transaction pooler (port 6543). */
    DATABASE_URL?: string
    /** A direct or session-pooled connection for migrations. */
    DIRECT_URL?: string
    /** The database server's CA certificate (PEM): required for a database on another host. */
    DATABASE_CA?: string
    /** JSON merged over the default sanitisation policy. */
    MUNI_SANITIZE_POLICY?: string
    /** Days before expiry that count as "expiring". */
    MUNI_EXPIRING_DAYS?: string
    /** Reads and writes a user may make per minute (defaults 300 and 60). */
    MUNI_RATE_LIMIT_READS?: string
    MUNI_RATE_LIMIT_WRITES?: string
    /** Clerk (required): every page but the landing needs a signed-in user. */
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string
    /** Clerk's secret key: the server's, and the e2e setup's (development keys only). */
    CLERK_SECRET_KEY?: string
    /** The token @clerk/testing sets for the e2e browser (auth.setup.ts checks it is there). */
    CLERK_TESTING_TOKEN?: string
    /** Set by CI runners (GitHub Actions): the e2e suites run on fewer workers there. */
    CI?: string
    /** Where pnpm was run from: the seed reads a directory given relative to it. */
    INIT_CWD?: string
  }
}
