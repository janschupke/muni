# Deployment (Vercel + Supabase)

Production runs on Vercel, with the database on Supabase. A new deployment then needs its
first data: see [First data](#first-data).

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

## First data

A new deployment starts with an empty register: the migrations create tables, not records.
Fill it once, from the import files in `data/import/` (derived from the raw exports in
`data/`; their README says what was inferred and what was left out).

1. **Deploy.** The production build applies the migrations.
2. **Make yourself an admin.** Sign up on the site, then in the Clerk dashboard set your
   user's public metadata to `{"role": "admin"}`. Sign out and in again (or wait five
   minutes) for the role to apply. Only an admin sees **Import**.
3. **Import.** Open `/import` and choose the five files in `data/import/` together:
   `mistnosti.csv`, `katalog_skoleni.csv`, `zamestnanci.csv`, `terminy_skoleni.csv`,
   `absolvovana_skoleni.csv`. Not `data/import/review/`: no import reads it.
4. **Review.** Every tab should show no errors. The warnings left are the rows worth a look
   (people in no department or not at work yet, sessions whose day has passed, trainings
   after the person left) and the departments, positions and providers the import creates.
5. **Confirm and import.** About 3,000 records go in eleven server calls; it takes a few
   seconds. The result should read: 9 rooms, 10 courses, 170 employees, 2,814 completions
   and 32 sessions created.
6. **Check what the import worked out.** The provider "Interní školitel" is the default for
   sessions that name none; each provider offers the courses its completions show, at the
   latest price paid; departments without a head get one from the reporting lines. Change
   any of them on the provider or department form.
7. **Decide the rows left out.** `data/import/review/ambiguities.csv` lists every export
   row the files leave out, and why. Enter the ones that are right by hand (the completion
   form), or fix them in the export and import that file again.

### From the command line

The same import runs from a terminal through `pnpm db:seed`, with the same reading, checks
and chunked writes as the wizard. Use it when the browser is not an option, or for a staging
copy:

```sh
DATABASE_URL='<the database URL>' pnpm db:seed data/import
```

A `DATABASE_URL` in the environment wins over `.env`. Against Supabase, use the session
pooler or a direct connection (port 5432), not the transaction pooler.

### When an import stops partway

Each chunk of up to 500 records is written in one transaction, so a refused chunk changes
nothing, but the chunks before it stay written. The wizard says what refused it and how many
records went in. Fix the cause and import the same files again: every record is matched by
its ID (or a course by its code, a room by its name), so nothing is written twice.

Each chunk counts against the admin's write limit (`MUNI_RATE_LIMIT_WRITES`, 60 a minute by
default). An import of more than about 30,000 records (60 chunks) at once may hit it; split the files,
or raise the limit for the import.
