# Architecture

How the packages fit together, how pages read data, and how writes reach the cache.

## Packages

| Package          | Imports                         |
| ---------------- | ------------------------------- |
| `@muni/web`      | db, domain, importer, ui, utils |
| `@muni/db`       | domain, importer, utils         |
| `@muni/importer` | domain, utils                   |
| `@muni/domain`   | utils                           |
| `@muni/ui`       | nothing internal                |
| `@muni/utils`    | nothing internal                |

Nothing imports `@muni/web`, and no import goes back up the table. A rule lives in
the lowest package that can hold it: policy (compliance, room fit, the session rules, the
advisor and planner) in `@muni/domain`, generic helpers in `@muni/utils`, queries in
`@muni/db`, screens in `@muni/web`.

## Folders

- **`apps/web/src`:**
  - `app/` holds the routes: each page checks access, prefetches its reads and renders a
    view, with its loading state beside it (`loading.tsx`).
  - `features/<domain>/` holds each domain's views, tables, forms and hooks.
  - `components/` holds what every domain shares, in folders: shell, navigation, views (the
    read, list and record scaffolds, skeletons), table, form (the form kit), feedback,
    badges.
  - `server/` holds the reads (`server/reads/`, one module per area, the handler in
    `server/reads/core/`), the actions (`server/actions/`, one module per area) and
    `server/auth.ts`.
  - `lib/` holds the browser helpers, in folders (form, list, format, navigation, query), and
    generic hooks.
  - `test/` holds the test helpers.
- **`packages/db/src/repositories`:** grouped by area (core, people, org, catalog,
  scheduling, planning, overview, records, archive) behind one `index.ts`. The integration
  tests are in `packages/db/src/integration/`.
- **`packages/domain/src`:** one module per rule set; the larger ones are folders (advisor,
  planner, schemas, sanitize), each exported through its `index.ts`.
- **`packages/importer/src`:** `parse/` (decoding, CSV, header recognition), `rows/` (a row
  read into fields), `validate/` (one module per dataset, run in dependency order by
  `validate/index.ts`), and `batch.ts` (files into a batch; each edit re-validates it).
- **`packages/ui/src/components`:** in folders: forms (fields and pickers), table (with the
  `DataTable` in `components/table/data-table/`), layout, feedback, actions, display. Each component is
  its own subpath export (`@muni/ui/select`).

A component file holds one component; logic in a component body goes into a named hook next
to it, or into `@muni/domain` when it is policy.

## Build

Internal packages ship TypeScript source (`exports` point at `src/`); Next compiles them via
`transpilePackages`, and tsx/vitest run them directly. There is no package build step, so
`typecheck` runs in every package.

`@muni/db`'s `client`, `repositories`, `writer` and `reference` entries import `server-only`:
anything that reaches the browser bundle fails the build. Scripts and test tooling that run
outside the app open their own client from `@muni/db/connect`; the seed runs under tsx with
`--conditions=react-server`, where the marker is a no-op.

## Reads, caching and writes

A page reads its data on the server and hands it to its view, which keeps it fresh in the
browser through TanStack Query.

- **A page on the server** checks who may see it (`requireReader` / `requireAdminPage`), reads
  its address (search params), runs its reads (`prefetched` in `apps/web/src/server/prefetch.tsx`)
  and renders a client view with the answers already in its cache. A record that is not
  there shows the not-found page.
- **A view reads** with `useQuery(readQuery(name, input))` from `/api/read/<name>`. Every
  read is defined once in `apps/web/src/server/reads/` (who may run it, its input as a zod
  schema, its load) and checked by one handler: 401 signed out, 403 archived or not an
  admin, 400 bad input, 404 unknown read or missing record. A read returns plain JSON;
  one that returns a `Date` or a `Map` does not compile.
- **Caching:** in the browser a read stays fresh for 5 minutes: a view that asks for it again
  inside that time (a filter set back, a page of a list seen before) gets it from the cache
  with no request; after it, the view shows what it has and refetches in the background,
  also when the window regains focus. Going to a page reads it on the server again. Only server errors are retried. The
  cache belongs to one user and role: another sign-in starts empty.
- **Loading:** every page has a `loading.tsx` beside it that shows the page's skeleton
  (`apps/web/src/components/views/skeletons.tsx`, in a `role="status"` region). It is the
  view's own loading state (each view exports it, from the same skeleton), so one replaces
  the other in place. Next prefetches it for the links on screen, so a click shows it at once,
  then the page streams in with its data. A loading state covers every route below its
  folder, so a page with routes below it keeps its page and loading state in an `(index)`
  route group, and a test fails on one that would stand in for another route's. Filtering,
  sorting or paging a list keeps the current rows, dimmed, until the next ones arrive. A
  failed read offers to try again.
- **Not found:** a missing record, or a page the role may not see, shows the not-found page.
  The page has already started streaming when it finds out, so the answer is 200 with
  Next's `noindex` tag, not a 404 status; an address no route matches is still a 404.
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
  table sorts by (`apps/web/src/lib/list/list-keys.ts`) and nothing else (`listInput`); `pageOf` sorts by the
  value the column shows (`apps/web/src/server/reads/core/sorters.ts`), Czech collation, missing values last
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
