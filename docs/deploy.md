# Deployment (Vercel + Supabase + Clerk)

Production runs on Vercel (region `fra1`), with the database on Supabase and sign-in on
Clerk. Only `master` deploys; every push to it migrates the database, then builds. The steps
below set up a new deployment once; a new deployment then needs its first data: see
[First data](#first-data).

## Supabase

1. Create a project in an EU region (Frankfurt, next to the functions in `fra1`). Keep the
   database password.
2. **Turn off the Data API** (Project Settings → Data API). The app reaches the database only
   through Prisma. The tables also refuse Supabase's `anon` and `authenticated` roles
   themselves (row-level security, migration `20261027090000_row_level_security`), so a Data
   API turned back on still shows nothing.
3. **Encrypted connections only** (Project Settings → Database → SSL Configuration): turn on
   "Enforce SSL on incoming connections", and download the **SSL certificate** there (a PEM
   file). Its content goes into `DATABASE_CA` on Vercel: the app connects to a database on
   another host only over TLS checked against it, and refuses to start without it.
4. From **Connect**, copy two connection strings, with the password filled in:
   - the **transaction pooler** (port 6543): `DATABASE_URL`, what the app uses at runtime;
   - the **session pooler** (port 5432), or the direct connection if your network has IPv6:
     `DIRECT_URL`, what the migrations use. Add `?sslmode=require` to it: the migrations then
     refuse an unencrypted connection too.

`prisma.config.ts` refuses to migrate through port 6543, so a production deploy without
`DIRECT_URL` fails before it changes anything.

## Clerk

1. In the Clerk dashboard, create the **production** instance of the app, on your domain
   (here `muni.schupke.io`).
2. **Domains:** add the DNS records Clerk lists (`clerk.`, `accounts.` and the email ones) at
   your DNS provider. Wait until Clerk shows each verified and the SSL certificates issued.
   Until then, nothing can sign in.
3. **Paths:** sign-in `/sign-in`, sign-up `/sign-up`, after sign-out `/`. The app's own
   pages are there.
4. **API keys:** copy the publishable key (`pk_live_`…) and the secret key (`sk_live_`…).

Roles live in each user's public metadata (`{"role": "admin"}`, `full`, `viewer`); a user
without one becomes a viewer on first sign-in. [First data](#first-data) says how to make the
first admin.

**Sign-up is open.** Anyone who creates an account is a viewer at once and reads the register
(names, departments, employment status, training history; personal details are redacted for
viewers, see [access](features/access.md)). Archiving an account does not stop its owner from
signing up again with another address. To let in only the people you invite, set Clerk's
**Restrictions → Sign-up mode** to Restricted (or allow only your email domain).

## Vercel

1. **Add New → Project**, import the repository. **Root Directory:** `apps/web`. Leave
   "Include files outside the root directory in the Build Step" on (the default): the app
   builds from the whole monorepo.
2. Leave the build settings to `apps/web/vercel.json`:
   - **Install:** checks that pnpm is 12 (the version `package.json` pins), then installs
     from the repo root.
   - **Build:** on a production deploy, applies the migrations; then builds the app with
     turbo.
   - **Deploy:** only `master` (`git.deploymentEnabled`); other branches get no preview, so
     no build ever runs against the database with another branch's schema.
   - **Skip:** when nothing the app depends on changed (`turbo-ignore`).

   Node is 24, from `engines` in `apps/web/package.json`.

3. **Domains:** add your domain and the DNS record Vercel asks for.
4. **Environment variables:** set these for Production (Settings → Environment Variables).

| Variable                            | Value                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`                      | Supabase transaction pooler (port 6543)                                             |
| `DIRECT_URL`                        | Supabase session pooler or direct connection (port 5432)                            |
| `DATABASE_CA`                       | Supabase's SSL certificate (PEM): required, the app refuses an unchecked connection |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production publishable key (`pk_live_`…)                                      |
| `CLERK_SECRET_KEY`                  | Clerk production secret key (`sk_live_`…)                                           |
| `CLERK_DISABLE_AUTO_PROXY`          | `1`: see below                                                                      |
| `ENABLE_EXPERIMENTAL_COREPACK`      | `1`: Vercel then installs with the pnpm `package.json` pins, not pnpm 9/10          |
| `MUNI_SANITIZE_POLICY`              | optional: JSON over the default field policy                                        |
| `MUNI_EXPIRING_DAYS`                | optional: days before expiry that count as expiring (default 30)                    |
| `MUNI_RATE_LIMIT_READS`, `_WRITES`  | optional: requests per user and minute (defaults 300 and 60)                        |

`CLERK_DISABLE_AUTO_PROXY`: when Vercel's production URL is a `vercel.app` address,
Clerk tells the browser to load it through `/__clerk` on the app's own host. Only a
request to a `vercel.app` host is answered there, so on your domain the page asks for
Clerk where nothing answers: sign-in never loads, and a visitor with an old Clerk cookie is
sent from `/` to `/sign-in`. With the variable set, the browser uses `clerk.` on your
domain, from the [Clerk](#clerk) steps.

## The first deploy

Deploy (**Deployments → Redeploy**, or push to `master`). In the build log, check:

- `pnpm install` runs pnpm 12 and Node 24. "pnpm 12 is needed" means
  `ENABLE_EXPERIMENTAL_COREPACK` is not set.
- `prisma migrate deploy` applies every migration (on a new database, all of them).

Then check Clerk from outside, with a stale Clerk cookie (it must send the browser to your
Clerk domain, not to `/__clerk`), and its script:

```sh
curl -sI -H 'Cookie: __client_uat=1' -H 'Sec-Fetch-Dest: document' https://muni.schupke.io/ | grep -i '^location'
#   location: https://clerk.muni.schupke.io/v1/client/handshake?…
curl -sI https://clerk.muni.schupke.io/npm/@clerk/clerk-js@6/dist/clerk.browser.js | head -1
#   HTTP/2 200
```

Sign up on the site, then fill the register: [First data](#first-data).

## Later deploys

Every push to `master` migrates, then builds. The migrations go first, so if the build fails
the database is already ahead of the running app: write each migration so the code before
it still works (add first, remove what the old code reads in a later deploy). Vercel's
**Instant Rollback** puts back the previous build, not the database.

Vercel deploys whatever `master` holds, whatever CI says of it; run `pnpm check` before
pushing (see [testing](testing.md#ci)).

The read limit (`MUNI_RATE_LIMIT_READS`) is per user. Lists, the advisor and the planner work
over the whole register on each request, which is cheap at a few hundred people; with open
sign-up, many accounts multiply it. A register of thousands needs sign-up restricted, or a
lower limit.

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
