# muni — training register

A register of mandatory staff training: who holds which course, what expires, what is
scheduled. Signed-in users read it, with personal data redacted unless their role allows it;
admins edit records and import CSV exports. Visitors see an introduction and nothing else.

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

Clerk keys are required: put development keys from the Clerk dashboard into `.env`
(`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`). Without them every request fails.

## Access

Clerk signs people in (`/sign-in`) and up (`/sign-up`); sign-ups must be enabled in the Clerk
dashboard. The role lives in Clerk, in the user's **public metadata**: `{"role": "viewer"}`,
`"full"` or `"admin"`.

| Who      | Sees                                                        | How they get it                  |
| -------- | ----------------------------------------------------------- | -------------------------------- |
| Visitor  | the introduction on `/`, sign-in and sign-up; nothing else  | not signed in                    |
| `viewer` | every page, read-only, personal data redacted on the server | every new account, automatically |
| `full`   | every page, read-only, whole records                        | set in Clerk by an administrator |
| `admin`  | everything, plus editing, bookings, import and `/users`     | set in Clerk by an administrator |

The `users` table mirrors Clerk (`apps/web/src/server/auth.ts`). On each new sign-in (a new
Clerk session), and at most every five minutes after, the app reads the user from Clerk: a
missing or unknown role is written back as `viewer` (and `Full` as `full`), and the row is
updated with the role, email, name and last sign-in. If Clerk cannot be reached, the stored
role is used. Bookings record the user who made them.

To change a role, an admin opens the user from `/users` and saves the new role there: it is
written to Clerk's public metadata first, then to the users table (setting `role` in the Clerk
dashboard works too). It applies at the user's next sign-in, or within five minutes. Admins
cannot change their own role, and the last admin keeps theirs. An archived user is refused
everything; the home page tells them their access has ended.

Enforcement is on the server, in three layers: `proxy.ts` sends visitors to sign-in on every
path except `/`, `/sign-in` and `/sign-up`; every page calls `requireReader()` (or
`requireAdminPage()`, a 404 for non-admins) before reading data; every server action calls
`requireAdmin()`.

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
`CourseSession`, `CourseCompletion`, `Provider` (a name plus IČO and contact details),
`Room` and `User` (mirrored from Clerk, see Access), all normalised:

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
- **Room fit:** `roomFit` in `@muni/domain/rooms` is the one judgement of whether a room can
  hold a session of a course, and the planner, the server checks and the room page all use it.
  - **A physical room:** the result sets each need beside what the room provides (seats needed
    against seats there, each needed piece of equipment held or lacking), then the first reason
    it fails, in numbers ("Needs 100 seats, has 40").
  - **An online room:** judged only on whether the course may be held online.
- **What a session needs:** `Course.sessionMinutes`, `groupSize`, `onlineAllowed` (what
  every sessions import derives from the course's sessions: usual length, median size, online
  if ever held online) next to `…Override` columns the course form sets, which imports never
  touch. The effective need is the override, else the derived value (`effectiveNeeds`).
  Equipment is only set in the app.
- **Sessions** are checked on the server, under the sessions lock and the session's row lock:
  the room must suit the course (online allowed, its equipment, a seat for every place the
  session opens), no other planned session may hold it then (online rooms never clash), and
  the seats never drop below the bookings (unnamed plus named). `sessionIssues` in
  `@muni/domain/sessions` holds the rules, and the session form runs it as the user types.
  A room or course edit that would leave upcoming sessions unfit is refused with the count.
- **Positions and departments:** a position is a title shared by departments ("Vedoucí" in
  every one), so `department_positions` lists the departments each position exists in, and a
  person's (department, position) pair must be one of them (a composite foreign key).
  Imports add the pairs their rows hold; the position form edits them, and refuses to drop a
  department where people still hold the position.
- **Department heads:** `Employee.leadsDepartment`, unique per department among active
  people (a partial index) and only for someone in one (a CHECK). Set on the department's
  form or the person's; moving or archiving the head leaves the department without one.
  Heads were filled once from the reporting lines (`fillDepartmentHeads`, which the seed
  runs too).
- **Leaving is a date:** `EmploymentStatus` is `ACTIVE` or `PARENTAL_LEAVE`; someone has
  left from their `leftOn` on (`stillEmployed`, `employmentState`), and stops counting then.
- **CHECKs** keep single-row rules whatever writes: sessions end after they start, nobody
  leaves before they were hired or manages themselves, validity never ends before the
  completion, prices are not negative, validity and override sizes are positive.
- **Names** of departments, positions, providers and rooms are `citext`: unique whatever the
  case. Imports match them ignoring case and accents too.

Source IDs (`E0001`,
`T001`, `Z000001`) are kept as `externalId`, and imports upsert on them, so re-importing a file
updates records instead of duplicating them. Records created in the app get their own prefix
(`S001` sessions, `A…` completions, `N0001` people), which imports refuse (`RESERVED_ID`), so
an export can never overwrite them. Date-only values are Postgres `date` columns;
session times are `timestamptz` converted from Europe/Prague wall-clock time.

Bookings: a session's seats are `unnamedBookings` (anonymous seats from the export) plus
`SessionAssignment` rows (a named person on a session, with FKs to both and to the `User` who
booked it). Admins add them from the advisor, from a session's page (a person) or from a
person's page (a session with a free seat). The booked total is always derived,
never stored twice. Saving a booking locks the session row (`SELECT … FOR UPDATE`) and
re-checks seats, status, clashes and need, so two people can never take the last seat.
`capacity >= 0` and `unnamed_bookings >= 0` are CHECK constraints in the migration SQL.
Re-importing a session stores `max(0, exported total − named bookings)` as unnamed seats.

Compliance is derived, not stored: for each active employee and each course a requirement
applies to, the best completion decides `VALID`, `EXPIRING` (within `MUNI_EXPIRING_DAYS`,
default 30), `EXPIRED` or `MISSING` (`packages/domain/src/compliance.ts`).

## Archiving

Nothing that carries history is deleted. Employees, courses, sessions, completions,
departments, positions, rooms, providers and users are **archived** (`archived_at`,
`archived_by_id`); only bookings and the join rows (requirements, equipment) are deleted. Every
foreign key is `ON DELETE RESTRICT`, and a lint rule in `@muni/db` refuses any other delete.

- **Hidden, not gone:** archived records leave every list, count, compliance rate, the advisor
  and the planner. Records that still point to one (a past session's room, a completion's
  provider) show it muted and unlinked.
- **People are anonymised:** an archived employee or user appears as "Archived employee
  #a1b2c3" everywhere, to every role. Only an admin opening that record's archived page sees
  who it was. `archive.integration.test.ts` reads every repository as each role and finds no
  name, email or ID of an archived person.
- **Unique keys are free again:** names, codes, source IDs, emails, IČO and Clerk IDs are
  unique among active rows only (partial indexes, `WHERE archived_at IS NULL`), so a new
  record can take an archived one's name. Bringing the old one back is then refused, as it
  is while something it belongs to is archived.
- **What may be archived:** a person's bookings on sessions ahead go with them (the dialog
  says how many). A course or room with sessions ahead, a session ahead with seats taken, or
  a department or position with people in it is refused, with the count. An admin cannot
  archive themselves or the last admin.
- **Imports** never revive an archived record or create an active twin of one: a row whose
  ID, code or name (or anything it refers to) only an archived record holds is skipped
  (`ARCHIVED`). The browser sends its files' keys and the server answers with the archived
  ones only.

Admins reach each kind's archived records from its list (`/rooms/archived`, …) and bring
them back from there.

## UI

Forms put the page heading inside the form, with Cancel and Save on its right, and the
fields in one full-width card. Dates and times are typed or picked: `DatePicker` (a calendar
on Radix Popover, driven fully from the keyboard) and `TimePicker` (hour and minute lists),
both posting ISO dates and `HH:mm`. Forms pick records by id from selects, never by a typed
name: a new provider is named on purpose ("New provider…"). A form can show errors it finds
itself (`clientErrors` on `FormShell`): the session form checks the room, seats, course and
times as they change, and asks the server whether the room is free then.

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
at full width: the people of a department or position, a course's sessions and completions,
a room's course fit, a provider's latest completions.

Motion is centralised in `packages/ui/src/styles/tokens.css`: three durations, the easings,
the named animations (`animate-fade-in`, `animate-pop-in`, …), and the default for every
`transition-*` utility. `prefers-reduced-motion: reduce` turns all of it off in one rule.

Every session has a public page (`/sessions/T016`) with its seats and who is booked by name,
and every location links to the sessions held there (`/sessions?location=Aula A`).

Providers (`/providers`) list who delivered the completions on record:

- **Each provider shows:** its IČO, its completions, people and courses, what was spent and the last completion.
- **Its page adds:** contact details, a breakdown by course and the latest 20 completions; the employee's completion history links to it.
- **Records:** imports create a provider by name (matched ignoring case and accents); the completion form picks one, or names a new one on purpose and is refused if that name is taken. Its details (IČO with its check digit, email, phone, website, note) are entered in the app, and imports leave them alone.
- **Rename and archive:** renaming changes the name on every completion. An archived provider stays on its completions, shown muted.
- **Prices:** the spend follows the `completion.price` policy. A viewer who may not see prices sees no sums of them either.

Back links ("← Employees") name the page the visitor actually came from, filters included,
from a per-tab history in `sessionStorage`; forms are skipped, and a page opened directly
links to its parent list.

## Advisor

`/advisor` shows every required training that is **non-compliant now** (expired or never
completed) or **lapses within the next 6 months**, what is being done about each, and which
session would cover the rest. Every role can read it; admins can save the proposals (as
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
  fix described, except rows that touch an archived record (`ARCHIVED`), which are skipped. Cells can be edited inline, rows removed, restored or reverted, and every
  change re-validates the whole batch, including references between files.
- **Rooms:** an optional `mistnosti.csv` (`nazev`, `typ`, `kapacita`, `vybaveni`; equipment
  as codes or Czech labels, `;`- or `,`-separated). Without one, each place the sessions name
  becomes a room (`ROOM_DERIVED`, once per room) of the kind its name implies ("Laboratoř 3"
  is a lab), sized by the largest session held there; spelling variants of a known room are
  unified, in a rooms file too. A rooms file without an equipment column leaves equipment as
  it is.
- **Same rules as the forms, as warnings:** a planned session in a room too small for it
  (`ROOM_TOO_SMALL`), lacking what the course needs (`ROOM_UNSUITABLE`) or taken then by
  another (`ROOM_BUSY`); a manager link that would make someone manage themselves is
  dropped (`MANAGER_CYCLE`). Each department, position and provider the import will create is
  named once (`WILL_CREATE`). Someone who left needs a leaving date (`LEFT_WITHOUT_DATE`).
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
they leave the server. Each field has a rule per role (`VIEWER`, `FULL`, `ADMIN`): `show`,
`omit`, `mask` (`keepFirst`/`keepLast`) or `maskEmail`. Defaults: for viewers the birth number
and notes are omitted and the email is masked; `full` and `admin` see whole records. Prices
are shown to everyone.

Override per deployment with `MUNI_SANITIZE_POLICY` (JSON, merged per field and role):

```sh
MUNI_SANITIZE_POLICY='{"employee.email":{"VIEWER":{"mode":"omit"}}}'
```

An invalid override (unknown field or mode, masking a number) throws on first use instead
of falling back. Repositories in `@muni/db/repositories` apply the policy; pages never read
Prisma models directly.

## Commands

| Command                 | What it does                                                    |
| ----------------------- | --------------------------------------------------------------- |
| `pnpm check`            | every gate below except e2e and Lighthouse (needs `db:up`)      |
| `pnpm test`             | unit tests in every package                                     |
| `pnpm coverage`         | tests with coverage in every package; fails below 90 %          |
| `pnpm test:integration` | repositories and seed against the test database (port 5439)     |
| `pnpm test:e2e`         | Playwright access, smoke and axe tests on `next start`, test DB |
| `pnpm test:lighthouse`  | Lighthouse on every page; reports in `test-results/lighthouse`  |
| `pnpm db:studio`        | Prisma Studio on the dev database                               |

The integration tests apply migrations and seed the test database; run them before
`pnpm test:e2e` and `pnpm test:lighthouse`, which also need `pnpm --filter @muni/web build`
first. Both sign in for real, through the Clerk development instance in `.env` (they refuse
production keys): the setup project (`e2e/auth.setup.ts`) creates three users if missing,
`muni-e2e-{viewer,full,admin}+clerk_test@example.com`, resets their roles (the viewer to
none, so the first sign-in has to fill it in), signs each in with `@clerk/testing` and saves
the session in `e2e/.auth/`. `e2e/access.spec.ts` checks what each role and a visitor get;
`e2e/register.spec.ts` walks the register as a viewer. On this machine Playwright needs
`NODE_OPTIONS=--no-network-family-autoselection` to reach Clerk.

Accessibility is checked twice. `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A/AA and best
practices) on every page as an admin (who sees every control) and on the introduction signed
out, in the light and dark theme, and on the open states (matrix row and dialog, employee
row, an open select); any violation fails. Unit tests also run axe on what they render
(`apps/web/src/test/axe.ts`, without contrast and target size, which jsdom cannot measure).
`pnpm test:lighthouse` requires accessibility 100, best practices 95, SEO 90 and performance
90 (desktop) on every page as an admin and on the introduction. One exception: findings
that name only Clerk's development domain (`*.clerk.accounts.dev`, whose Cloudflare cookies
are third-party) do not fail it, and `summary.json` lists them under `clerkDevOnly`. A
production Clerk instance on the app's own domain has none; with a development instance,
best practices measures 77 on every page for that reason alone.

Coverage has one standard for every package (`vitest.preset.ts`): at least 90 % of lines,
statements, functions and branches of everything under `src/`, files without tests included.
Only tests, test helpers and the generated Prisma client are left out. `@muni/db` is measured
over its unit and integration tests together, against the test database, so `pnpm coverage`
needs `pnpm db:up`. In the web app, pages and server actions are unit-tested too: the tests
render async server components with mocked repositories (`apps/web/src/test/`).

## Checks

`pnpm check` runs these in order; CI (`.github/workflows/check.yml`) runs the same steps
against a Postgres 17 service.

| Gate      | Command             | What fails it                                                           |
| --------- | ------------------- | ----------------------------------------------------------------------- |
| Format    | `pnpm format:check` | anything Prettier would change                                          |
| Lint      | `pnpm lint`         | any ESLint error or warning, in every package and the root config files |
| Types     | `pnpm typecheck`    | any tsc error, in every package and the root config files               |
| Dead code | `pnpm knip`         | unused files, exports or dependencies                                   |
| Schema    | `pnpm check:schema` | an invalid or unformatted `schema.prisma`                               |
| Drift     | `pnpm check:drift`  | migrations that do not produce `schema.prisma` (test database)          |
| Tests     | `pnpm coverage`     | a failing test, or coverage under 90 %                                  |
| Build     | `pnpm build`        | a failing `next build`                                                  |

What the gates enforce:

- **TypeScript** (`tsconfig.base.json`):
  - `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`: a forwarded optional prop is typed `?: T | undefined`.
  - `noPropertyAccessFromIndexSignature`: a record's keys are read with brackets.
  - Every environment variable is declared in `env.d.ts`, so a misspelled name is a type error.
- **ESLint** (`eslint.preset.js`):
  - typescript-eslint's `strictTypeChecked` and `stylisticTypeChecked`;
  - React hooks; JSX accessibility (`eslint-plugin-jsx-a11y-x`, the ESLint 10 fork);
  - Next's rules; Vitest rules on tests (no `.only` or `.skip`, valid `expect`) and Playwright rules on e2e;
  - imports sorted in four groups: node builtins, packages, `@/`, then relative files;
  - a `title` attribute is banned in favour of `Tooltip`;
  - an unused `eslint-disable` is an error.
- **Messages** (`apps/web/src/i18n/messages-parity.test.ts`):
  - both locales have the same keys;
  - every message parses as ICU, with the same arguments and tags in Czech and English;
  - keys looked up with a runtime value match their enum exactly;
  - a key no source names fails.
- **Git hooks**: `pnpm install` installs lefthook (`lefthook.yml`). A commit runs Prettier and each package's ESLint on the staged files only; everything else stays in `pnpm check` and CI.

Playwright e2e and Lighthouse are not in `pnpm check` or CI: they need browsers, a production build, the seeded test database and Clerk. Run them locally before a release (see Commands). CI's build needs the Clerk development keys as repository secrets, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.

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
