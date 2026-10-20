# Deployment (Vercel + Supabase)

Production runs on Vercel, with the database on Supabase.

Create a Vercel project with root directory `apps/web`; `apps/web/vercel.json` installs from
the repo root, applies migrations on production deploys, then builds.

| Variable                                                | Value                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                                          | Supabase transaction pooler (port 6543), used at runtime                      |
| `DIRECT_URL`                                            | Supabase session pooler or direct connection (port 5432), used for migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk production keys                                                         |
| `MUNI_SANITIZE_POLICY`, `MUNI_EXPIRING_DAYS`            | optional                                                                      |
| `MUNI_RATE_LIMIT_READS`, `MUNI_RATE_LIMIT_WRITES`       | optional: per user and minute (defaults 300 and 60)                           |

`prisma.config.ts` refuses to run migrations against port 6543. A production deploy without
`DIRECT_URL` fails. Preview deploys never migrate, whatever database they point at: a branch's
migrations reach a database only once it is deployed to production. The function region is
`fra1`; keep the Supabase project in an EU region next to it.
