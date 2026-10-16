# muni — training register

A register of mandatory staff training: who holds which course, what expires, what is
scheduled. Anyone can read it; signed-in users can edit records and import CSV exports.

Stack: pnpm workspaces + Turborepo, Next.js 16 (App Router, Vercel), Postgres (Docker locally,
Supabase in production), Prisma 7 with migrations, Clerk, next-intl (cs/en), Tailwind CSS 4.

## Getting started

Requirements: Node 24 (`.nvmrc`), pnpm 12 (`corepack enable`), Docker.

```sh
cp .env.example .env
pnpm install
pnpm db:up            # Postgres: dev on :5438, test on :5439
pnpm db:migrate       # apply migrations to the dev database
pnpm db:seed          # import ./data through the same importer the UI uses
pnpm dev              # http://localhost:3060
```

Without Clerk keys the site is the public read-only register: no sign-in, and the edit and
import routes return 404. To enable editing, put development keys from the Clerk dashboard
(or `npx clerk@latest init`) into `.env`. Every signed-in user can edit and import; there are
no roles, so restrict sign-ups in the Clerk dashboard (allowlist or restricted mode).

## Layout

| Path                | Package          | What it holds                                                                                                  |
| ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------- |
| `apps/web`          | `@muni/web`      | Next.js app: pages, server actions, the import wizard, i18n messages                                           |
| `packages/db`       | `@muni/db`       | Prisma schema and migrations, client, repositories (sanitised DTOs), import writer, seed                       |
| `packages/importer` | `@muni/importer` | CSV decoding, parsing, normalisation, row and cross-file validation. Pure TypeScript, runs in browser and Node |
| `packages/domain`   | `@muni/domain`   | Enums, zod schemas, the compliance engine, the sanitisation policy                                             |
| `packages/ui`       | `@muni/ui`       | Design tokens and components (Tailwind 4, Radix, lucide), `DataTable` on TanStack Table                        |
| `packages/utils`    | `@muni/utils`    | Text folding, date and money parsing, date math and formatting (luxon), number and currency formatting         |
| `data/`             |                  | The source CSV exports                                                                                         |

Internal packages ship TypeScript source (`exports` point at `src/`); Next compiles them via
`transpilePackages`, and tsx/vitest run them directly. There is no package build step, so
`typecheck` runs in every package.

## Data model

`Department`, `Position`, `Employee` (with a manager self-relation), `Course`,
`CourseRequirement` (who must hold a course: everyone, a department or a position; no rows
means optional), `CourseSession`, `CourseCompletion` and `Provider`. Source IDs (`E0001`,
`T001`, `Z000001`) are kept as `externalId`, and imports upsert on them, so re-importing a file
updates records instead of duplicating them. Date-only values are Postgres `date` columns;
session times are `timestamptz` converted from Europe/Prague wall-clock time.

Compliance is derived, not stored: for each active employee and each course a requirement
applies to, the best completion decides `VALID`, `EXPIRING` (within `MUNI_EXPIRING_DAYS`,
default 30), `EXPIRED` or `MISSING` (`packages/domain/src/compliance.ts`).

## UI

Pages are built from `@muni/ui` primitives, one subpath export each (`@muni/ui/select`,
`@muni/ui/data-table`, …). Primitives that wrap a link take `asChild`
(`<Button asChild><Link href="…">…</Link></Button>`), so the package never imports Next.

Tables use `DataTable` (TanStack Table 9) and sort by clicking a header. Text sorts with
Czech collation, and missing values sort last in both directions. Small lists (courses,
sessions, completion history, the import review) are sorted in the browser; the review sorts
every row of the current filter before paging. The employee list is paginated on the server,
so it is also sorted there: the order lives in the URL (`?sort=department&dir=desc`) and is
applied in `listEmployees` before the page is cut.

Dates and times are formatted with luxon in Europe/Prague time (`@muni/utils/format`);
date-only values are formatted as UTC so the day never shifts. Amounts use `Intl.NumberFormat`.

## Importing

The wizard at `/import` follows the same flow as ceum: upload, review, confirm, progress.

- **Upload:** files are recognised by their header, not their name. Encoding (UTF-8 with or
  without BOM, Windows-1250) and delimiter (`,` `;` tab) are detected.
- **Review:** rows with an **error** are skipped. Rows with a **warning** are imported with the
  fix described. Cells can be edited inline, rows removed, restored or reverted, and every
  change re-validates the whole batch, including references between files.
- **Commit:** in dependency order (courses, employees, sessions, completions), in chunks of 500.
  The server re-validates every record with the domain schemas before writing.

What the importer does with the defects in `data/`:

| Defect                                                   | Result                                       |
| -------------------------------------------------------- | -------------------------------------------- |
| `d. m. yyyy`, `dd.mm.yyyy`, ISO dates                    | read silently                                |
| Excel serial dates (`43552`)                             | read, warning                                |
| `1900-01-01` placeholders, impossible dates (`31. 9.`)   | error                                        |
| `BOZP_Z`, ` kyber`                                       | normalised course code, warning              |
| unknown codes (`KYB3R`, `BOZP-X`)                        | error (no fuzzy guessing)                    |
| department and provider spelling variants                | unified to the most common spelling, warning |
| same person twice (same email or birth number)           | later row rejected; their records remapped   |
| employees that do not exist (`E9001`)                    | error                                        |
| duplicate record IDs                                     | the repeat is rejected                       |
| `zdarma`, `450,- Kč`, `2 100 Kč`                         | parsed; negative prices are errors           |
| spreadsheet formulas in notes (`=HYPERLINK(…)`)          | formula trigger removed, warning             |
| blank lines, repeated header, `#` comments, `Celkem` row | skipped                                      |
| missing validity date                                    | derived from the course validity, warning    |

`packages/importer/src/fixtures.test.ts` runs the importer over the real files and pins
these outcomes and the totals.

## Sensitive data

Fields listed in `packages/domain/src/sanitize/sanitize.config.ts` go through a policy before
they leave the server. Each field has a rule per audience (`anonymous`, `authenticated`):
`show`, `omit`, `mask` (`keepFirst`/`keepLast`) or `maskEmail`. Defaults: the birth number is
omitted for visitors and masked to its last four digits for signed-in users; email is masked
for visitors; notes are hidden from visitors.

Override per deployment with `MUNI_SANITIZE_POLICY` (JSON, merged per field and audience):

```sh
MUNI_SANITIZE_POLICY='{"employee.email":{"anonymous":{"mode":"omit"}}}'
```

An invalid override (unknown field or mode, masking a number) throws on first use instead
of falling back. Repositories in `@muni/db/repositories` apply the policy; pages never read
Prisma models directly.

## Commands

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm check`            | format check, lint, typecheck, knip, unit tests, build           |
| `pnpm test`             | unit tests in every package                                      |
| `pnpm test:integration` | repositories and seed against the test database (port 5439)      |
| `pnpm test:e2e`         | Playwright smoke tests against `next start` on the test database |
| `pnpm db:studio`        | Prisma Studio on the dev database                                |

The integration tests apply migrations and seed the test database; run them before
`pnpm test:e2e`, which also needs `pnpm --filter @muni/web build` first.

## Deployment (Vercel + Supabase)

Create a Vercel project with root directory `apps/web`; `apps/web/vercel.json` installs from
the repo root, applies migrations, then builds.

| Variable                                                | Value                                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`                                          | Supabase transaction pooler (port 6543), used at runtime                      |
| `DIRECT_URL`                                            | Supabase session pooler or direct connection (port 5432), used for migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk production keys                                                         |
| `MUNI_SANITIZE_POLICY`, `MUNI_EXPIRING_DAYS`            | optional                                                                      |

`prisma.config.ts` refuses to run migrations against port 6543. A production deploy without
`DIRECT_URL` fails; previews without a database skip migrations. The function region is
`fra1`; keep the Supabase project in an EU region next to it.
