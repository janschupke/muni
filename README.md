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
`CourseSession`, `CourseCompletion`, `Provider` and `Room`, all normalised:

- **Who must hold a course:** `Course.requiredForAll`, plus one link table per audience
  (`course_department_requirements`, `course_position_requirements`). No flag and no links
  means optional.
- **Rooms:** a session points at a `Room` (kind: classroom, lab, online, external, outdoor;
  seats; note). What a room offers and what a course needs are link tables of one
  `Capability` enum (projector, computers, lab equipment, vehicle, practice area, video
  conferencing, wheelchair access). "Online" is the room's kind, not a session flag; an
  online room has no seat limit and every other room has seats (a CHECK). A room's
  utilisation is its booked hours over the next 30 days from tomorrow, against Czech working
  days (weekends and public holidays, Easter included, are out) of 8 hours.
- **What a session needs:** `Course.sessionMinutes`, `groupSize`, `onlineAllowed` and its
  capabilities. Every sessions import derives them from the course's sessions (usual length,
  median size, online if ever held online) until someone sets them in the course form
  (`needsManual`); after that imports leave them alone.
- **Sessions created in the app** are checked on the server, under a lock: the room must suit
  the course (online allowed, its equipment, a seat for every place the session opens) and
  no other planned session may hold it then (online rooms never clash).
- **Department heads** are not stored: the head is the member with the most other members
  anywhere beneath them in the reporting chain (so a head over two team leads outranks
  either lead); when no member manages another, the outside manager most members report to.

Source IDs (`E0001`,
`T001`, `Z000001`) are kept as `externalId`, and imports upsert on them, so re-importing a file
updates records instead of duplicating them. Records created in the app get their own prefix
(`S001` sessions, `A…` completions), which imports refuse (`RESERVED_ID`), so an export can
never overwrite them. Date-only values are Postgres `date` columns;
session times are `timestamptz` converted from Europe/Prague wall-clock time.

Bookings: a session's seats are `unnamedBookings` (anonymous seats from the export) plus
`SessionAssignment` rows (a named person on a session, with FKs to both; deleting a session
cascades, deleting a person with bookings is refused). The booked total is always derived,
never stored twice. Saving a booking locks the session row (`SELECT … FOR UPDATE`) and
re-checks seats, status, clashes and need, so two people can never take the last seat.
`capacity >= 0` and `unnamed_bookings >= 0` are CHECK constraints in the migration SQL.
Re-importing a session stores `max(0, exported total − named bookings)` as unnamed seats.

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

Every amount is in Czech crowns (`CURRENCY` in `@muni/utils/format`):

- `formatCurrency` shows one, or the placeholder when there is none. Whole amounts drop the decimals.
- Price fields name the currency with `currencySymbol` ("Kč", "CZK") rather than a literal in the messages.
- The forms read an amount with the import's parser (`money()` → `parseCzk`), so `1 200,50 Kč` and `zdarma` work in both.
- The database stores decimals, and the repositories convert them with `toAmount`.

### Colour

One palette, defined once in `packages/ui/src/styles/tokens.css`:

- **Ramps** (`--ramp-*`) are the only place colour values live: a warm neutral ramp for
  surfaces, ink and hairlines; brand blue; and green, yellow, orange and red for signals.
  Steps run light (50) to dark (900). The signal ramps are built in OKLCH around the dataviz
  reference status colours (green 500, yellow 300, orange 400, red 500).
- **Roles** (`--p-*`, used as Tailwind classes such as `bg-surface-elevated`,
  `text-success-fg`, `bg-status-expired`) pick a light and a dark step with `light-dark()`.
  The OS preference chooses the side unless the theme switch pins it (`data-theme`).
- **Signals mean one thing each:** green = held, yellow = attention soon (expiring, a session
  80 % booked or full), orange = lapsed, red = action needed (missing, overbooked). Blue is
  the brand and never a state. A signal colour always comes with an icon and a label.
- **Compliance rates** are coloured by band (`complianceBand` in `@muni/domain`): 100 %,
  90–99 %, 75–89 %, 50–74 % and under 50 %, in plain sentiment colours: solid green, light
  green, yellow, orange, red (`bg-heat-*`). Neighbouring bands stay apart for colour-blind
  readers (ΔE ≥ 8.2); the closest pair overall, a green and the orange further down the
  scale, is ΔE 7.0, which the printed rate makes safe: every cell prints it, on an ink with at least
  4.8:1 contrast. Rate meters and the overview card use the same bands in the four signal
  colours (100 % and 90–99 % are both green).

### Layout

A top bar at every width carries the logo and name, the language and theme switches and the
account. From `lg` (1024px) the navigation is a sidebar below it, in groups (Register,
Training, Planning); it collapses to an icon rail with tooltips, and the choice is a cookie
the server reads, so the first paint is right. Below `lg` the bar's menu opens the same
navigation in a drawer, which closes on any route change and when the screen widens to `lg`.
On a phone the bar keeps the logo without the name. Content runs full width up to 1920px
(`max-w-page`). Tooltips are
Radix (`Tooltip`, `IconButton`); a lint rule bans native `title` attributes on DOM elements
(an iframe's stays: it names the frame) and on the components that pass them through.

Errors: `error.tsx` logs the error, shows its digest as a reference and retries with fresh
data; `global-error.tsx` draws its own page when the root layout fails. Every record route
has its own not-found page naming the missing record.

The compliance matrix opens each department into one row per person, under the course
columns, and each cell into a dialog listing its people, most urgent first. The department
and position lists open each row to its people's records: position or department,
employment, the share held, and every training that needs attention with its booking.

A detail page has its facts card beside the main section (`SplitLayout`). Long tables follow it
at full width: the people of a department or position, a course's sessions and completions.

Motion is centralised in `packages/ui/src/styles/tokens.css`: three durations, the easings,
the named animations (`animate-fade-in`, `animate-pop-in`, …), and the default for every
`transition-*` utility. `prefers-reduced-motion: reduce` turns all of it off in one rule.

Every session has a public page (`/sessions/T016`) with its seats and who is booked by name,
and every location links to the sessions held there (`/sessions?location=Aula A`).

Back links ("← Employees") name the page the visitor actually came from, filters included,
from a per-tab history in `sessionStorage`; forms are skipped, and a page opened directly
links to its parent list.

## Advisor

`/advisor` shows every required training that is **non-compliant now** (expired or never
completed) or **lapses within the next 6 months**, what is being done about each, and which
session would cover the rest. Visitors can read it; signed-in users can save the proposals (as
`ADVISOR` bookings) and move unnamed seats out of overbooked sessions.

- **Breakdown** (the default view): one bar per bucket, "non-compliant now" and then each month
  in which trainings lapse, split into **planned in time** (a named booking that ends before the
  training lapses), **planned with a gap** (the booking ends after it lapses, or it has already
  lapsed) and **action required** (nothing booked). Selecting a bucket lists its trainings with
  the **non-compliance window**: from the day the training lapses (`validUntil + 1`) until the
  booked session ends, or open when nothing is booked.
- **Action required**: the unbooked trainings in queue order, each with the proposed session and
  the gap it would leave, or the reason there is none and what to do.
- **Remediation planned** and **Overbooked**: the booked trainings with their windows, and the
  sessions over capacity with the seat moves that fix them.

The plan is `planAssignments` in `packages/domain/src/advisor.ts`, one fixed and deterministic
rule with no settings. The page prints the same rule:

1. People on parental leave are left out.
2. A named booking on an upcoming session of the course is a planned remediation.
3. Overbooked sessions first: their unnamed seats move to other sessions of the same course with
   room (named bookings never move), and those seats are not offered again.
4. Everything else is queued: expired (longest expired first), never completed, then by the day
   it lapses; ties go by name (Czech collation), employee ID and course code.
5. Each takes a session with a free seat that does not overlap the person's other bookings: the
   earliest one if the training has lapsed; otherwise the last one that ends before it lapses
   (retrain just in time), or the earliest one if none does.
6. Otherwise the reason is reported: `NO_SESSION`, `NO_SEATS` or `CONFLICT`. Courses short of
   sessions are listed.

Saving re-checks every pair on the server (seats under a row lock, clashes, the requirement,
and that the training has lapsed or lapses within the forecast); the browser's plan is never
trusted.

## Session planner

`/planner` proposes new sessions for training the advisor cannot place (no session of the
course ahead, or every one full), with one fixed rule (`packages/domain/src/planner.ts`):

- Demand is grouped by course and due date: everything already lapsed is due within two
  weeks; the rest is due the day before the first of a month's trainings lapses.
- A group needs `ceil(people ÷ group size)` sessions, earliest lapse first. A course without
  a group size fills the largest room that suits it (online: everyone at once).
- Each session takes the first working day (weekends and Czech public holidays are not) from
  tomorrow on which a valid room is free at the course's usual start time, for its usual
  length. Valid: online if the course allows it, otherwise every capability the course needs
  and enough seats. Rooms the course used before come first, then the smallest that fits.
  Planned sessions and earlier offers both block a physical room; an online room is never
  taken.
- A slot after the due date is offered and marked late. Otherwise the offer says why: what
  even the best-equipped room lacks, that the equipped rooms are too small, that a session
  would end after midnight, or that no slot is free in 120 days.
- Signed-in users create the session from an offer. The server checks the room again (it
  may have been taken meanwhile), and the result stays at the screen's foot.

## Importing

The wizard at `/import` follows the same flow as ceum: upload, review, confirm, progress.

- **Upload:** files are recognised by their header, not their name. Encoding (UTF-8 with or
  without BOM, Windows-1250) and delimiter (`,` `;` tab) are detected.
- **Review:** rows with an **error** are skipped. Rows with a **warning** are imported with the
  fix described. Cells can be edited inline, rows removed, restored or reverted, and every
  change re-validates the whole batch, including references between files.
- **Rooms:** an optional `mistnosti.csv` (`nazev`, `typ`, `kapacita`, `vybaveni`; equipment
  as codes or Czech labels, `;`- or `,`-separated). Without one, each place the sessions name
  becomes a room (`ROOM_DERIVED`, once per room) of the kind its name implies ("Laboratoř 3"
  is a lab), sized by the largest session held there; spelling variants of a known room are
  unified, in a rooms file too. A rooms file without an equipment column leaves equipment as
  it is.
- **Commit:** in dependency order (rooms, courses, employees, sessions, completions), in
  chunks of 500.
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

| Command                 | What it does                                                          |
| ----------------------- | --------------------------------------------------------------------- |
| `pnpm check`            | format check, lint, typecheck, knip, coverage, build (needs `db:up`)  |
| `pnpm test`             | unit tests in every package                                           |
| `pnpm coverage`         | tests with coverage in every package; fails below 90 %                |
| `pnpm test:integration` | repositories and seed against the test database (port 5439)           |
| `pnpm test:e2e`         | Playwright smoke and axe tests against `next start` on the test DB    |
| `pnpm test:lighthouse`  | Lighthouse on every public page; reports in `test-results/lighthouse` |
| `pnpm db:studio`        | Prisma Studio on the dev database                                     |

The integration tests apply migrations and seed the test database; run them before
`pnpm test:e2e` and `pnpm test:lighthouse`, which also need `pnpm --filter @muni/web build`
first.

Accessibility is checked twice. `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A/AA and best
practices) on every public page in the light and dark theme, and on the open states (matrix
row and dialog, employee row, an open select); any violation fails. Pages that need a
signed-in user are checked by axe in their unit tests (`apps/web/src/test/axe.ts`, without
contrast and target size, which jsdom cannot measure). `pnpm test:lighthouse` requires
accessibility 100, best practices 95, SEO 90 and performance 90 (desktop) on every public
page.

Coverage has one standard for every package (`vitest.preset.ts`): at least 90 % of lines,
statements, functions and branches of everything under `src/`, files without tests included.
Only tests, test helpers and the generated Prisma client are left out. `@muni/db` is measured
over its unit and integration tests together, against the test database, so `pnpm coverage`
needs `pnpm db:up`. In the web app, pages and server actions are unit-tested too: the tests
render async server components with mocked repositories (`apps/web/src/test/`).

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
