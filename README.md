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
pnpm db:migrate:deploy  # apply pending migrations to the dev database
pnpm db:seed            # import ./data through the same importer the UI uses
pnpm dev                # http://localhost:3060
```

`pnpm db:migrate` (`prisma migrate dev`) is for writing a new migration after a schema
change; `db:migrate:deploy` only applies what is already in `prisma/migrations`. Both read
`.env` and fail when it names no database.

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

`@muni/db`'s `client`, `repositories`, `writer` and `reference` entries import `server-only`:
anything that reaches the browser bundle fails the build. Scripts and test tooling that run
outside the app open their own client from `@muni/db/connect`; the seed runs under tsx with
`--conditions=react-server`, where the marker is a no-op.

## Data model

`Department`, `Position`, `Employee` (with a manager self-relation), `Course`,
`CourseSession`, `CourseCompletion`, `Provider` (a name plus IČO and contact details),
`ProviderCourse` (an offering), `Room` and `User` (mirrored from Clerk, see Access), all
normalised:

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
- **What a course's sessions are:** `Course.sessionMinutes` (the length; none set, nothing
  can be scheduled), `seats` (what a new session opens; a session sets its own `capacity`),
  `onlineAllowed` and its equipment, one value each, set on the course form. An import
  fills them only where they are still unset (the first import of a course's sessions: usual
  length, median seats, online if ever held online) and never overwrites them.
- **Offerings:** `provider_courses` says which provider offers which course, at a price per
  person (CHECK ≥ 0; 0 for internal training), edited as rows on the provider form. An
  offering upcoming sessions of the provider still use cannot be dropped. One active provider
  is the **default** (a partial unique index): imported sessions that name no provider go to
  it, and it cannot be archived. A provider with sessions ahead cannot be archived either.
- **A session derives from its course and provider:** it is held by a provider
  (`CourseSession.providerId`, required) that offers its course; it ends its course's length
  after it starts (`sessionEnd`); its price is the offering's, copied when it is scheduled or
  its course or provider changes, so later price changes reach new sessions only. Imported
  sessions keep their exported times and price until moved or given another course or
  provider. The form shows the end and the price; it never types them.
- **Sessions** are checked on the server, under the sessions lock and the session's row lock:
  the provider must offer the course and the course must have a length, the room must suit
  the course (online allowed, its equipment, a seat for every place the session opens), no
  other planned session may hold it then (online rooms never clash), and the seats never drop
  below the bookings (unnamed plus named). `sessionIssues` in
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
  completion, prices (sessions', completions', offerings') are not negative, validity,
  lengths and seats are positive.
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
booked it). Only what a person needs is booked: a training required of them that they do not
hold, lapsed or lapsing soon, with nothing booked (`bookingState`). Admins book from every place
such a training shows, always through one **Book…** dialog that lists each training with the
session proposed for it (the advisor's plan) and up to five alternatives to choose from: the
advisor's two tables, a person's required trainings, the people of the employee list and of a
department or position (each person, or each training of an opened row), and a compliance
matrix cell (each person, or all who need it). Where a training needs booking but cannot be
booked (the person is on leave, no session of the course is scheduled, or every one is full),
**Book…** stays in its place, dimmed, and says why on hover and focus. Booked, the row shows
when and where, and the way to cancel the booking, in the same column. A session's page offers
only the people who need its course. The booked total is always derived, never stored twice. Saving a booking
locks the session row (`SELECT … FOR UPDATE`) and re-checks seats, status, clashes and need,
so two people can never take the last seat and nobody is booked on a training that is not
required of them or that they hold past the advisor's forecast.
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
  says how many). A course or room with sessions ahead, or a department or position with
  people in it, is refused, with the count. A session still to start is **cancelled**, not
  archived (its page and row offer Cancel in Archive's place; its bookings stay as the record
  of who was to come, and those people need a session again); once cancelled or over it can be
  archived. A cancelled session still to start can be reinstated if its room and people are
  still free then. The edit form never changes a session's status. An admin cannot
  archive themselves or the last admin.
- **Imports** never revive an archived record or create an active twin of one: a row whose
  ID, code or name (or anything it refers to) only an archived record holds is skipped
  (`ARCHIVED`). The browser sends its files' keys and the server answers with the archived
  ones only.

Admins reach each kind's archived records from its list (`/rooms/archived`, …) and bring
them back from there.

## UI

### Glossary

One word per thing, in both locales. The message test fails on the words in the last column.

| Thing                                         | English          | Czech        | Not                     |
| --------------------------------------------- | ---------------- | ------------ | ----------------------- |
| A seat a person holds on a session            | booking          | rezervace    | přihláška               |
| A part of the organisation                    | department       | oddělení     | útvar                   |
| Who delivered a completion                    | provider         | poskytovatel | dodavatel               |
| A course a provider holds, at a price         | offering         | nabídka      | contract                |
| Where a session is held                       | room             | místnost     | location                |
| A catalogue entry (a table column naming one) | course           | kurz         | training                |
| A required course a person has valid          | held             | splněno      | valid trainings         |
| A provider's registration number              | Company ID (IČO) | IČO          | a bare "IČO" in English |
| Making a new record                           | Create …         | Vytvořit …   | Add …                   |

"Přihlásit se" is signing in, and stays.

### Forms

Forms put the page heading inside the form, with Cancel and Save on its right, and the
fields in one full-width card. Dates and times are typed or picked: `DatePicker` (a calendar
on Radix Popover, driven fully from the keyboard) and `TimePicker` (hour and minute lists),
both posting ISO dates and `HH:mm`. Forms pick records by id from selects, never by a typed
name: a new provider is named on purpose ("New provider…").

Forms check themselves as the user types, with the same reader and schema the server action
runs on save (`apps/web/src/lib/form-inputs.ts`), so the browser and the server cannot
disagree about what is valid:

- **When a field shows its error:** once it has been left. A required field that is emptied
  goes red at once, and after a save attempt every field shows its error. Once an error is
  showing, it updates on every keystroke.
- **Errors say what is wrong:** an email, phone, web address, birth number, course code,
  date or time each have their own message. Limits carry their number ("Enter at most 720").
- **A form with errors is not sent.** The first field with an error gets the focus, as it
  does after the server refuses a save. A server error stays on its field until that field
  changes, and a refused save keeps everything that was typed.
- **Field state for styles and tests:** each field marks whether it changed (`data-dirty`),
  was visited (`data-touched`) or is wrong (`data-invalid`).
- **Save on an edit form** stays off until something differs from what was loaded.
- **When the form opens,** the first field has the focus.
- **Placeholders** show example values (`jana.novakova@firma.cz`, `KURZ-01`, a date in the
  locale's order).
- **Checks the form makes on its own** (`clientErrors` on `FormShell`): the session form
  checks the room, seats, course and times as they change, and asks the server whether the
  room is free then; the employee form checks the position against the department and the
  lead against having one.
- **A field never changes another.** A choice at odds with another field marks every field
  that can settle it, with the same words on each, and the form is not sent until one does:
  a room too small marks the room and the seats, a room lacking what the course needs the
  room and the course, seats below the bookings the seats and the unnamed bookings, a
  department without the chosen position the department and the position (which stays
  listed, marked "not in this department").
- **Save and Cancel go back where the form was opened from,** filters included, from the
  per-tab history the back links use (`useOrigin`). A form opened directly (typed,
  bookmarked, reloaded, a new tab) has no origin: a save goes to the record, Cancel to its
  parent. Archiving from a record's page does the same, falling back to its list.

### Data and state

Pages read their data in the browser through TanStack Query; the server only guards them.

- **A page on the server** checks who may see it (`requireReader` / `requireAdminPage`), reads
  its address (search params) and, for a record's page, whether the record is there
  (`recordExists`), so a missing one still answers 404. It then renders a client view.
- **A view reads** with `useQuery(readQuery(name, input))` from `/api/read/<name>`. Every
  read is defined once in `apps/web/src/server/reads/` (who may run it, its input as a zod
  schema, its load) and checked by one handler: 401 signed out, 403 archived or not an
  admin, 400 bad input, 404 unknown read or missing record. A read returns plain JSON;
  one that returns a `Date` or a `Map` does not compile.
- **Caching:** data stays fresh for 5 minutes. A revisit inside that time renders from the
  cache with no request; after it, the page shows what it has and refetches in the
  background, also when the window regains focus. Only server errors are retried. The
  cache belongs to one user and role: another sign-in starts empty.
- **Loading:** the first visit shows a skeleton shaped like the page (`components/skeletons.tsx`,
  in a `role="status"` region). Filtering, sorting or paging a list keeps the current rows,
  dimmed, until the next ones arrive. A failed read offers to try again. There is no
  `loading.tsx`: it would flash on every navigation, cached or not.
- **Forms read fresh:** a form's read is never cached or refetched while it is open, so an
  edit starts from what is saved and typing is never overwritten.
- **After a write,** the action returns the record's address (`{ status: 'saved', href }`),
  used when the form has no origin. The browser drops the cache of every page not on screen,
  marks the rest stale, and then navigates (`useWhenWritten`). Actions do not refresh server routes; only the language
  switch does, because it re-renders the layout.

Pages are built from `@muni/ui` primitives, one subpath export each (`@muni/ui/select`,
`@muni/ui/data-table`, …). Primitives that wrap a link take `asChild`
(`<Button asChild><Link href="…">…</Link></Button>`), so the package never imports Next.

Tables use `DataTable` (TanStack Table 9). Every list is sorted and paged on the server: the
browser gets one page, 25 rows, in the order asked for. The order and the page live in the
address (`?sort=department&dir=desc&page=2`); a page with two lists names the second's
(`?completionsSort=price&completionsPage=3`). A header click asks for its order from the first
page, every other parameter kept; a server list always has an order, so the header flips
between its two directions.

- **One function per list:** `parseList` reads the address for both the page's prefetch and
  the view (`useListUrl`), so they name the same cache entry. Each read takes the columns its
  table sorts by (`lib/list-keys.ts`) and nothing else (`listInput`); `pageOf` sorts by the
  value the column shows (`server/reads/sorters.ts`), Czech collation, missing values last
  both ways, and cuts the page.
- **Which lists:** every list page, the archived ones, the advisor's tables (the plan is
  computed whole, the table's trainings sent a page at a time), the planner (ten courses a
  page, offers sorted within each), and every list on a record's page: a person's completions,
  a department's people (and an opened row's members), a room's and a course's sessions ahead,
  a course's and a provider's completions, a provider's courses.
- **Which tables hold every row,** and say why (`DataTable paging={{ local }}`,
  `data-paging` on the page): the import review (its rows exist only in the browser until
  imported), a session's attendees and an offer's people (bounded by seats), the trainings one
  person must hold and the per-course breakdowns of a room and a department (bounded by the
  catalogue), the overview's preview of the next six sessions, and the compliance grid.

A course's page lists its sessions ahead and links to the past ones
(`/sessions?when=past&course=CODE`).

Dates and times are written one way in both languages, `17.10.2026 9:00`, by pattern (luxon,
Europe/Prague time, `@muni/utils/format`), so the server and the browser agree; date-only
values are formatted as UTC so the day never shifts. A typed date reads `dd.mm.yyyy`, with
any separators. Month names follow the language.

Every amount is in Czech crowns (`CURRENCY` in `@muni/utils/format`), written the Czech way in
both languages:

- `formatCurrency` shows one with its two decimals (`1 200,00 Kč`), or the placeholder when
  there is none; price fields show theirs to edit as `450,50` (`formatAmount`).
- Price fields name the currency with `currencySymbol` ("Kč") rather than a literal in the messages.
- The forms read an amount with the import's parser (`money()` → `parseCzk`), so `1 200,50 Kč` and `zdarma` work in both.
- The database stores decimals, and the repositories convert them with `toAmount`.

### Writes: confirmations and toasts

Every write says how it went, in a toast at the bottom right (`components/toasts.tsx`, Radix
Toast): "Course created", "Booked 3 people", "Booking cancelled". Toasts live in the root
layout, so a save that goes on to the record still shows on the page it lands on; a failure
stays until it is closed, the rest leave after six seconds. A form's button says what it does
("Schedule session", "Record completion", "Save changes"), never just "Save".

A write asks first (`components/confirm-dialog.tsx`) when it cannot be undone, touches many
records, costs money or does more than its button shows: cancelling a booking, changing a role
(with what the new role can do, and what an admin loses), archiving and bringing back,
cancelling or reinstating a session, moving its bookings to another course (from the edit form), booking from
the advisor, resolving overbooking and creating from the planner. The dialog says exactly what
will change; its confirm button names the act and the other one keeps things as they are. A
refusal shows in the dialog, which stays open; a partial result lists what was refused.

### Opened rows

A table row that opens shows its details as panels (`DetailGrid`, `DetailPanel` in the UI kit),
each with a heading and its count: a session's facts (when, the room against what the course
needs, the seats by name and without, the price, the status) beside the people booked on it
with their department, position and how they were booked; a course's planned sessions, what a
session needs and compliance by department; a person's required trainings; a department's or
position's people; a planner offer's people and the other rooms free then.

### Colour

One palette, defined once in `packages/ui/src/styles/tokens.css`:

- **Ramps** (`--ramp-*`) are the only place colour values live: a warm neutral ramp for
  surfaces, ink and hairlines; brand blue; and green, yellow, orange and red for signals.
  Steps run light (50) to dark (900). The signal ramps are built in OKLCH around the dataviz
  reference status colours (green 500, yellow 300, orange 400, red 500); the fills step away
  from them where a rule below needs it (light: green 600, yellow 550, orange 600, red 700;
  dark: green 500, yellow 300, orange 300, red 400).
- **Roles** (`--p-*`, used as Tailwind classes such as `bg-surface-elevated`,
  `text-success-fg`, `bg-status-expired`) pick a light and a dark step with `light-dark()`.
  The OS preference chooses the side unless the theme switch pins it (`data-theme`).
- **Surfaces are layers, and a higher layer is lighter** in both themes:

  | Layer                                                | Light       | Dark        |
  | ---------------------------------------------------- | ----------- | ----------- |
  | the page (`surface-base`); wells in cards (`sunken`) | neutral 100 | 950 / 900   |
  | cards, sidebar, top bar, footer (`surface-elevated`) | neutral 50  | neutral 850 |
  | dialogs, popovers, tooltips (`surface-overlay`)      | neutral 50  | neutral 800 |
  | form controls and secondary buttons (`control`)      | white       | neutral 750 |

  A field is the top layer wherever it sits, so it never shares its container's fill and
  needs no context. A disabled field drops its fill (`disabled:bg-transparent`) and its
  strong outline: flat against its container, so it cannot pass for an enabled one. A
  field's outline (`border-control`) has 3:1 against the field and every surface. In light,
  dialogs and popovers share the card fill and stand out by their shadow.

- **Translucent ink for what sits on any layer.** Bar tracks (`chart-track`), skeletons and
  neutral badges (`tint`) darken (or, in dark, lighten) whatever is under them, so a track
  shows in a card, on the page and in an opened row alike. Hover and press are state layers
  painted over an element's own fill (`layer-hover`, `layer-active`); a table row publishes
  its state as `--row-state`, which its pinned cells paint over their opaque fill
  (`layer-row`), so a row's hover reaches its pinned column.
- **Signals mean one thing each:** green = held, yellow = attention soon (expiring, a session
  80 % booked or full), orange = lapsed, red = action needed (missing, overbooked). Blue is
  the brand and never a state. A signal colour always comes with an icon and a label.
- **The colour contract** (`packages/ui/src/styles/tokens.test.ts`) reads `tokens.css` as data
  and checks every pairing the UI renders, in both themes, translucent roles composited first:
  a fill against what it sits on ΔE ≥ 0.02 (OKLab); a control's outline, a bar fill on its
  track and on every surface 3:1 (WCAG 1.4.11); text 4.5:1; any two signal fills ΔE ≥ 0.09,
  since they meet in stacked bars. Coloured text reads as a colour: the link, accent,
  success, warning, serious and danger inks each stand ΔE ≥ 0.10 from every text grey and
  0.09 from each other (warning would otherwise read as one more brown-grey). Fills read as
  their sentiment: the warning fill is a clear yellow (OKLab lightness ≥ 0.75) and the danger
  fill a full red (chroma ≥ 0.17, not pink), in both themes. No yellow reaches 3:1 on white, so
  every warning fill carries a 1px edge in the amber ink (`inset-ring-warning-edge`), and the
  edge is what meets 3:1. It also scans the app for colour classes: a role used
  anywhere but in no pairing fails, so a new use cannot skip the contract. The rendered pages
  are checked too (next section).
- **Compliance rates** are coloured by band (`complianceBand` in `@muni/domain`): 100 %,
  90–99 %, 75–89 %, 50–74 % and under 50 %, in plain sentiment colours: solid green, light
  green, yellow, orange, red (`bg-heat-*`). Neighbouring bands stay apart for colour-blind
  readers (ΔE ≥ 8.2); the closest pair overall, a green and the orange further down the
  scale, is ΔE 7.0, which the printed rate makes safe: every cell prints it, on an ink with at least
  4.8:1 contrast. Rate meters and the overview card use the same bands in the four signal
  colours (100 % and 90–99 % are both green). A rate is printed as its whole percent rounded
  down (`compliancePercent`, through `formatRate`), and the band is taken from that same
  number, so two cells that read the same are the same colour and only a full rate reads
  100 %. `compliance.test.ts` checks every count up to 300.

- **Links** are drawn one way, by `TextLink`: the link colour (`text-link`, blue-500 /
  blue-250), underlined only on hover. No link sits inside a sentence: in the dark theme no
  blue has both 3:1 against the body text and 4.5:1 on the dialog surface, so colour alone
  could not tell it from the words around it (WCAG 1.4.1). A label goes on its own line
  ("Department" over "Laboratoře") or a link stands in its own cell. Full email addresses are
  `mailto:` links (`EmailLink`).
- **Icon buttons** take the colour of what they do (`IconButton tone`): edit and undo accent,
  bring back success, archive and remove danger (one red for every destructive act; serious
  marks status only), with a soft fill of it on hover; close, clear-a-filter and the sidebar
  toggle stay grey.
- **Buttons:** in a group, one is primary (or danger, confirming a destructive act) and it
  comes last, on the right; the others, navigation included, are secondary, with a
  background; only a way back out is ghost (`CancelButton`). Starting a destructive act
  (Archive in a record's header) is `destructive`: secondary with the danger ink.

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
employment, the share held, and every training that needs attention with its booking, or the
way to book it. Their "Upcoming bookings" count links to the bookings it counts
(`/departments/[id]/bookings`, `/positions/[id]/bookings`): its people's named bookings on
sessions still ahead, a page at a time.

A detail page has its facts card beside the main section (`SplitLayout`). Long tables follow it
at full width: the people of a department or position, a course's sessions and completions,
a room's course fit, a provider's latest completions.

Motion is centralised in `packages/ui/src/styles/tokens.css`: three durations, the easings,
the named animations (`animate-fade-in`, `animate-pop-in`, …), and the default for every
`transition-*` utility. `prefers-reduced-motion: reduce` turns all of it off in one rule.

Every session has a public page (`/sessions/T016`) with its seats and who is booked by name,
and every location links to the sessions held there (`/sessions?location=Aula A`).

Providers (`/providers`) list who holds sessions and who delivered the completions on record:

- **Each provider shows:** its IČO, its completions, people and courses, what was spent and the last completion.
- **Its page adds:** contact details, whether it is the default for imported sessions, the
  courses it offers (price, sessions ahead, a Schedule button that opens the session form
  with the provider chosen), its upcoming sessions, and its completions by course, each a page
  at a time; the employee's completion history links to it.
- **Offerings:** edited on the provider form as rows (course, price per person), each course
  once. Dropping a course its upcoming sessions use is refused with their number. A new price
  reaches sessions scheduled from then on.
- **Scheduling, the same everywhere:** the course list's rows, the course page, a room's
  course fit and a provider's offerings each have one Schedule button. It opens the course's
  session form with what the place knows (the room, the provider), or is disabled and says why:
  the course has no length, no provider offers it, or the room does not suit it.
- **Records:** imports create a provider by name (matched ignoring case and accents); the completion form picks one, or names a new one on purpose and is refused if that name is taken. Its details (IČO with its check digit, email, phone, website, note) are entered in the app, and imports leave them alone.
- **Rename and archive:** renaming changes the name on every completion. An archived provider stays on its completions, shown muted.
- **Prices:** the spend follows the `completion.price` policy. A viewer who may not see prices sees no sums of them either.

Back links ("← Employees") name the page the visitor actually came from, filters included,
from a per-tab history in `sessionStorage`; forms are skipped, and a page opened directly
links to its parent list. Forms go back the same way after saving (see Forms).

## Advisor

`/advisor` shows every required training that is **non-compliant now** (expired or never
completed) or **lapses by the end of the sixth month**, counting the current one (the page
names that day: "Lapsing by Mar 31, 2027"), what is being done about each, and which
session would cover the rest. Every role can read it; admins book people from it and resolve
overbooked sessions, always through a dialog that shows what will happen first.

- **Breakdown** (the default view): one bar per bucket, "non-compliant now", then everything
  lapsing in the forecast together (`?bucket=upcoming`, the row the "Lapsing by …" card
  opens), then each of its months set in under it (the current one named by the days left in
  it, "Oct 18, 2026 – Oct 31, 2026"); each card's count is its row's. Each is split into **planned in time** (a named booking that ends before the
  training lapses), **planned with a gap** (the booking ends after it lapses, or it has already
  lapsed) and **action required** (nothing booked). Selecting a bucket lists its trainings with
  the **non-compliance window**: from the day the training lapses (`validUntil + 1`) until the
  booked session ends, or open when nothing is booked.
- **Action required**: the unbooked trainings in queue order, each with the proposed session and
  the gap it would leave, or the reason there is none and what to do. Booking works the same
  here and in the breakdown: **Book…** on a row, or rows picked and **Book N selected…**,
  opens the decision: each training with a session select (the proposal or one of up to five
  alternatives: other sessions with a free seat and no clash, those that end before the
  training lapses first), the price of each and the total, a box to leave one out, and, per
  session, people chosen against seats free (a session that would overfill stops the
  confirm). The confirm button names the count and the cost ("Book 3 trainings · 1 350,00
  Kč"); refusals the server finds are listed in the dialog, the rest are booked.
- **Remediation planned**: the booked trainings with their windows; cancelling one asks first.
- **Overbooked**: the sessions over capacity with the advisor's suggestion. **Resolve…**
  explains the session (booked by name and without a name, against capacity) and offers two
  ways: move seats booked without a name to sessions of the course the admin picks, how many
  to each (the suggestion fills it in; each capped at its seats free, the total at the seats
  without a name), or raise the capacity to fit everyone when the room has the seats. Either
  is one transaction (`moveSeatsMany`, `raiseCapacity`): every move goes through or none.

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
- A group needs `ceil(people ÷ seats)` sessions, earliest lapse first. A course without
  seats set fills the largest room that suits it (online: everyone at once). A course with no
  length or no provider offering it is not planned; the offer says which.
- Each offer is held by the default provider if it offers the course, else by the cheapest
  offering (ties by name), at that offering's price.
- Each session takes the first working day (weekends and Czech public holidays are not) from
  tomorrow on which a valid room is free at the course's usual start time, for its
  length. Valid: online if the course allows it, otherwise every capability the course needs
  and enough seats. Rooms the course used before come first, then the smallest that fits.
  Planned sessions and earlier offers both block a physical room; an online room is never
  taken.
- A slot after the due date is offered and marked late. Otherwise the offer says why: what
  even the best-equipped room lacks, that the equipped rooms are too small, that a session
  would end after midnight, or that no slot is free in 120 days.
- An offer is not created as it stands. **Review…** opens it for editing: day, start (the end
  follows from the course's length), provider (the course's offerings, each with its price),
  room (every room, each labelled with its seats and whether it suits the course), capacity,
  and the people to book (all ticked; untick to leave someone out). The dialog checks as
  the user types: the room taken then, a room that does not suit, fewer seats than people,
  a start that would end the session after midnight; a weekend, a holiday or a date after the due date is a warning.
  **Check** runs the real transaction on the server and undoes it (`dryRun`), answering what
  would be refused and why; the review then shows exactly what will be created and what the
  bookings cost. Only **Create session and book N people** writes, all or nothing
  (`createSessionWithBookings`): one person who cannot be booked stops the session too.

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
- **Providers:** a sessions file may name each session's provider (`poskytovatel` or
  `provider`). A named provider must exist and offer the course (`PROVIDER_UNKNOWN`,
  `PROVIDER_NOT_OFFERING`, errors). A session that names none goes to the default provider;
  with no default the row is refused (`NO_DEFAULT_PROVIDER`), and a course the default does
  not offer yet is added to its offerings at the row's price (`OFFERING_ADDED`, a warning).
  A completions file adds an offering for each provider and course it shows delivered and
  not offered yet, at the latest price paid; it never changes an existing offering.
- **Commit:** in dependency order (rooms, courses, employees, completions, sessions), in
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
of falling back. So does a rule for `ADMIN` other than `show`: admins edit these fields, and
their forms read them whole, so the policy cannot hide anything from them. Repositories in `@muni/db/repositories` apply the policy; pages never read
Prisma models directly.

## Commands

| Command                 | What it does                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm check`            | every gate below except e2e and Lighthouse (needs `db:up`)                               |
| `pnpm test`             | unit tests in every package                                                              |
| `pnpm coverage`         | tests with coverage in every package; fails below 90 %                                   |
| `pnpm test:integration` | repositories and seed against the test database (port 5439)                              |
| `pnpm test:e2e`         | Playwright access, smoke and axe tests on `next start`, test DB                          |
| `pnpm test:lighthouse`  | Lighthouse on every page; reports in `test-results/lighthouse`                           |
| `pnpm test:visual`      | screenshots of every page and state, both themes, in `apps/web/visual-shots`, for review |
| `pnpm db:studio`        | Prisma Studio on the dev database                                                        |

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
practices, `e2e/support/a11y.ts`) on every page in `e2e/support/pages.ts` as an admin (who
sees every control: lists, records, every form, the import, the archived lists), on the
introduction, sign-in and sign-up signed out, in the light and dark theme, and on the open
and passing states: matrix row and dialog, employee row, an open select, your own role, the
import's three steps, a link and each icon button hovered and focused, the session and
employee forms with fields at odds. Any violation fails, and so does text whose contrast
axe could not settle (under a pinned cell, over an overlap): it is measured from the painted
layers instead. The same states go through `e2e/support/contrast.ts`, which measures what
axe does not, on the rendered page: a filled element either matches what it sits on or
stands ΔE 0.02 apart from it; each enabled control's outline and each meter's fill have
3:1; every link's colour stands ΔE 0.09 from the page's text and its block's, and a link in
running text needs 3:1 against it (axe's own rule passes a link the colour of its text and
skips links alone in a cell); and hovering a table's first row
changes every cell, pinned ones included. Every text link is a `TextLink`, underlined when
hovered and never before, and words drawn on its line within 1em make it running text (where
they sit in the markup does not matter). Button groups hold to the rule above
(`e2e/support/buttons.ts`), and every table says how its rows are paged
(`e2e/support/paging.ts`). `e2e/lists.spec.ts` sorts each list by a header and pages the long
ones, checking the address and that the rows the server sends change. Clerk's footer is left out only on a development
instance, which stripes it in orange; the app's appearance sets its text colour.
`e2e/layout.spec.ts` checks geometry at 1920px: an opened row's panel spans its table, a
toolbar's controls share a line, the import's steps span the page. Every e2e test fails on an
error thrown in the page (a hydration mismatch included) and on a Content-Security-Policy
violation. Unit tests also run axe on what they render
(`apps/web/src/test/axe.ts`, without contrast and target size, which jsdom cannot measure).
`pnpm test:lighthouse` requires accessibility 100, best practices 95, SEO 90 and performance
90 (desktop) on every page as an admin, in both themes, and on the introduction. One exception: findings
that name only Clerk's development domain (`*.clerk.accounts.dev`, whose Cloudflare cookies
are third-party) do not fail it, and `summary.json` lists them under `clerkDevOnly`. A
production Clerk instance on the app's own domain has none; with a development instance,
best practices measures 77 on every page for that reason alone.

Coverage has one standard for every package (`vitest.preset.ts`): at least 90 % of lines,
statements, functions and branches of everything under `src/`, files without tests included.
Only tests, test helpers and the generated Prisma client are left out. `@muni/db` is measured
over its unit and integration tests together, against the test database, so `pnpm coverage`
needs `pnpm db:up`. In the web app, pages and server actions are unit-tested too: the tests
render async server components with mocked repositories (`apps/web/src/test/`). A view's
reads go straight to the read handler (`test/reads.ts`), so a page test runs the same guard
and load as the real route, and `renderServer` waits until every read has answered.

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
  - a key no source names fails;
  - a word the glossary below replaced fails, in either locale.
- **Git hooks**: `pnpm install` installs lefthook (`lefthook.yml`). A commit runs Prettier and each package's ESLint on the staged files only; everything else stays in `pnpm check` and CI.

Playwright e2e and Lighthouse are not in `pnpm check` (they need browsers, a production build, the seeded test database and Clerk) but CI runs them in a second job, `e2e`: it migrates and seeds the test database, builds, installs Chromium and runs the a11y, access, crud and register suites and Lighthouse; on a failure it keeps the Playwright report and traces. Both jobs need the Clerk development keys as repository secrets, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The `check` job also runs `pnpm audit --prod --audit-level high`. Renovate (`renovate.json`) opens one pull request a week for minor and patch updates, and holds TypeScript below 7 and the prisma packages together.

## Deployment (Vercel + Supabase)

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
