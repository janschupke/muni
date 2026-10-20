# muni — training register

A register of mandatory staff training: who holds which course, what expires, what is
scheduled. Signed-in users read it, with personal data redacted unless their role allows it.
Admins edit records, book people on sessions and import CSV exports. Visitors see an
introduction and nothing else.

Stack: pnpm workspaces + Turborepo, Next.js 16 (App Router, Vercel), Postgres (Docker locally,
Supabase in production), Prisma 7 with migrations, Clerk, next-intl (cs/en), Tailwind CSS 4.

## Getting started

Requirements: Node 24 (`.nvmrc`), pnpm 12 (`corepack enable`), Docker.

```sh
cp .env.example .env      # then add the Clerk development keys
pnpm install
pnpm db:up                # Postgres: dev on :5438, test on :5439
pnpm db:migrate:deploy    # apply the migrations to the dev database
pnpm db:seed              # import ./data through the same importer the UI uses
pnpm dev                  # http://localhost:3060
```

Clerk keys are required: put development keys from the Clerk dashboard into `.env`
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`). Without them every request fails.

`pnpm db:migrate` (`prisma migrate dev`) writes a new migration after a schema change;
`db:migrate:deploy` only applies what is already in `packages/db/prisma/migrations`.

## Using it

Sign up at `/sign-up` (sign-ups must be enabled in the Clerk dashboard). Every new account is a
`viewer`; an admin raises it from `/users`. To make the first admin, set the user's public
metadata in the Clerk dashboard to `{"role": "admin"}`.

| Role     | Sees                                                        |
| -------- | ----------------------------------------------------------- |
| Visitor  | the introduction on `/`, sign-in and sign-up                |
| `viewer` | every page, read-only, personal data redacted on the server |
| `full`   | every page, read-only, whole records                        |
| `admin`  | everything, plus editing, bookings, import and `/users`     |

The pages:

- **Overview** (`/`): what is non-compliant, what lapses soon, the next sessions.
- **Register:** employees, departments, positions.
- **Training:** courses, sessions, rooms, providers. A session's page shows who is booked on
  it.
- **Planning:** the compliance matrix; the advisor (`/advisor`), which proposes a session for
  every training that has lapsed or lapses within six months; the planner (`/planner`), which
  proposes new sessions where none can take it. Admins book from either, always through a
  dialog that shows the result first.
- **Administration** (admins): the import (`/import`: upload the CSV exports, review and fix
  the rows, import) and the users (`/users`: roles).
- **Archive:** nothing with history is deleted. Each list links to its archived records
  (`/rooms/archived`, …), where admins bring them back.

## Layout

| Path                | Package          | What it holds                                                                    |
| ------------------- | ---------------- | -------------------------------------------------------------------------------- |
| `apps/web`          | `@muni/web`      | Next.js app: pages, reads, server actions, features, i18n messages               |
| `packages/db`       | `@muni/db`       | Prisma schema and migrations, repositories (sanitised DTOs), import writer, seed |
| `packages/importer` | `@muni/importer` | CSV decoding, parsing and validation; pure TypeScript, runs in browser and Node  |
| `packages/domain`   | `@muni/domain`   | Enums, zod schemas, compliance, the advisor and planner, the sanitisation policy |
| `packages/ui`       | `@muni/ui`       | Design tokens and components (Tailwind 4, Radix, lucide), `DataTable`            |
| `packages/utils`    | `@muni/utils`    | Text folding, dates, money parsing and formatting                                |
| `data/`             |                  | The source CSV exports                                                           |
| `docs/`             |                  | How it works, in depth                                                           |
| `.ai/`              |                  | Rules for coding agents (and people)                                             |

## Commands

| Command                    | What it does                                                   |
| -------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                 | the app on http://localhost:3060                               |
| `pnpm check:changed`       | only the checks the changed files need                         |
| `pnpm check`               | every gate except the browser suites (needs `db:up`)           |
| `pnpm test`                | unit tests in every package                                    |
| `pnpm coverage`            | tests with coverage; fails below 90 %                          |
| `pnpm test:integration`    | repositories, import writer and seed against the test database |
| `pnpm test:e2e`            | Playwright suites on the production build (build first)        |
| `pnpm test:visual`         | screenshots of every page and state, both themes, for review   |
| `pnpm test:lighthouse`     | Lighthouse on every page                                       |
| `pnpm db:seed`, `db:reset` | re-import `data/`; reset the dev database                      |
| `pnpm db:studio`           | Prisma Studio on the dev database                              |

## Checks

`pnpm check` runs format, lint, typecheck, knip, the schema and drift checks, coverage and
the build; CI (`.github/workflows/check.yml`) runs the same, then the e2e suites and
Lighthouse in a second job. After a change, `pnpm check:changed` runs only what that change
needs. Which change needs which check: `.ai/rules/gates.md`. Every gate and test layer:
[docs/testing.md](docs/testing.md).

## Docs

- [Architecture](docs/architecture.md): packages, reads and caching, writes.
- [Data model](docs/data-model.md): models, database rules, bookings, archiving.
- [UI](docs/ui.md): glossary, forms, confirmations, layout. [Colour](docs/design.md).
- Features: [advisor](docs/features/advisor.md), [planner](docs/features/planner.md),
  [import](docs/features/import.md), [access and sensitive data](docs/features/access.md).
- [Testing and checks](docs/testing.md), including troubleshooting.
- [Deployment](docs/deploy.md): Vercel and Supabase, environment variables.
