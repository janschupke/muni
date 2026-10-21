# Testing and checks

The test layers, what each gate enforces, and how to run the browser suites.

## Layers

| Layer                    | Where                                                                                                                                                                                             | Runs with                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Unit                     | `*.test.ts(x)` next to the module, in every package                                                                                                                                               | `pnpm test`, `pnpm coverage` |
| Pages and server actions | `apps/web/src/app/**`, `apps/web/src/server/**` tests: async server components rendered with mocked repositories                                                                                  | `pnpm test`                  |
| Integration              | `packages/db/src/integration/`: repositories, the import writer and the seed against the test database, which it empties first; `fresh-import` fills a new database of its own from `data/import` | `pnpm test:integration`      |
| Colour contract          | `packages/ui/src/styles/tokens.test.ts`                                                                                                                                                           | `pnpm test`                  |
| Messages                 | `apps/web/src/i18n/messages-parity.test.ts`                                                                                                                                                       | `pnpm test`                  |
| Docs                     | `scripts/docs-paths.test.ts`: every path the docs name exists                                                                                                                                     | `pnpm test:root`             |
| e2e                      | `apps/web/e2e/*.spec.ts`: access, a11y, bookings, crud, import, layout, lists, register, signin                                                                                                   | `pnpm test:e2e`              |
| Import files             | `packages/importer/src/derive/derive.test.ts`: `data/import` is what `pnpm data:derive` writes, and imports cleanly                                                                               | `pnpm test`                  |
| Visual                   | `apps/web/e2e/visual.shots.ts`: every page and state, both themes                                                                                                                                 | `pnpm test:visual`           |
| Lighthouse               | `apps/web/e2e/lighthouse.audit.ts`                                                                                                                                                                | `pnpm test:lighthouse`       |

Web tests run on a fixed day (`apps/web/src/test/clock.ts`), so fixtures dated ahead stay
ahead.

## After a change

`pnpm check:changed` (`scripts/check-changed.ts`) runs only what the changed files need:
Prettier on those files; ESLint, typecheck and the related tests in their packages and the
packages that depend on them (type-aware lint rules read other files' types, so a package
lints whole; when only tests changed, only those files), and the schema, drift, message or colour suites when their
files changed. It prints each check and why it ran; `--dry-run` only prints them, `--base
<ref>` compares against another commit. For a UI change it says to rebuild and run the e2e spec that covers it, by hand.
The pre-push hook runs it on the commits a push carries (`--push`): a dirty tree is refused, and with nothing to compare with the whole gate runs. `pnpm check` is the full run, before a
merge.

## CI

`.github/workflows/check.yml` runs on every push and pull request, in two jobs, each against a
throwaway Postgres on the test database's port:

- **check:** `pnpm audit` of what ships, then `pnpm check`, the full gate.
- **e2e:** the production build, every e2e spec, then Lighthouse.

Both sign in through the same Clerk **development** instance as local e2e, so the repository
needs two secrets (Settings → Secrets and variables → Actions → New repository secret, or
`gh secret set CLERK_PUBLISHABLE_KEY` and `gh secret set CLERK_SECRET_KEY`):

| Secret                  | Value                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `CLERK_PUBLISHABLE_KEY` | the development instance's publishable key, `pk_test_`…, as in local `.env` |
| `CLERK_SECRET_KEY`      | the development instance's secret key, `sk_test_`…, as in local `.env`      |

Never the production keys: the e2e setup creates the three e2e users and rewrites their
roles, and refuses anything but `pk_test_` and `sk_test_` keys. Each job's first step checks
the two secrets and stops, naming them, if either is missing or not a development key.

GitHub gives no secrets to pull requests from forks, so their runs stop at that step.

To keep a failing commit off `master`, protect the branch (Settings → Branches) and require
the `check` and `e2e` jobs. Vercel deploys whatever `master` holds, whether CI passed or not.

## Browser tests

The browser suites run against `next start` and the test database:

```sh
pnpm db:up
pnpm --filter @muni/web build       # e2e, visual and Lighthouse run the production build
pnpm test:e2e                       # or one spec: pnpm --filter @muni/web exec playwright test e2e/crud.spec.ts
```

Rebuild after every source change; the suites do not.

Each run starts with `apps/web/e2e/register.setup.ts`: it migrates the test database, empties
it and seeds the register the suites read. The register is `data/import` with every date
moved so that the day it is seen from (`E2E_AS_OF` in `apps/web/e2e/support/register.ts`) is
today: what is ahead stays ahead, whatever the date, on every machine. Specs that type or
name a date take it from the same frame (`seeded`, `seededCzech`, `seededMonth`).

They sign in for real, through the Clerk development instance in `.env` (they refuse
production keys): the setup project (`apps/web/e2e/auth.setup.ts`) creates three users if
missing, `muni-e2e-{viewer,full,admin}+clerk_test@example.com`, resets their roles (the viewer
to none, so the first sign-in has to fill it in), signs each in with `@clerk/testing` and
saves the session in `apps/web/e2e/.auth/`. `access.spec.ts` checks what each role and a
visitor get; `register.spec.ts` walks the register as a viewer; `crud.spec.ts` drives the
forms and archiving as an admin, `bookings.spec.ts` sessions, booking and the planner, and
`signin.spec.ts` signs in through Clerk's form and checks the app that comes up.

### Troubleshooting

- **Playwright cannot reach Clerk** (a timeout in the setup project, while `curl` reaches it):
  Node's IPv6/IPv4 auto-selection times out on some networks. Run with
  `NODE_OPTIONS=--no-network-family-autoselection`.
- **The test database is on another port:** `docker-compose.yml` publishes 5439; something
  else bound to it (a local Postgres) answers instead. Stop it or change the port in
  `docker-compose.yml` and `.env`.
- **A page shows old behaviour in e2e:** the build is stale. Rebuild.

## Accessibility and contrast

Accessibility is checked in the browser. `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A/AA and best
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
they sit in the markup does not matter). Button groups hold to the rule in [design.md](design.md)
(`e2e/support/buttons.ts`), and every table says how its rows are paged
(`e2e/support/paging.ts`). `e2e/lists.spec.ts` sorts each list by a header and pages the long
ones, checking the address and that the rows the server sends change. Clerk's footer is left out only on a development
instance, which stripes it in orange; the app's appearance sets its text colour.
`e2e/layout.spec.ts` checks geometry at 1920px: an opened row's panel spans its table, a
toolbar's controls share a line, the import's steps span the page. Every e2e test fails on an
error thrown in the page (a hydration mismatch included) and on a Content-Security-Policy
violation. Unit tests do not run axe: jsdom has no layout, and the browser sweep above already
reaches every page, dialog and form state, signed in.
`pnpm test:lighthouse` requires accessibility 100, best practices 95, SEO 90 and performance
90 (desktop) on every page as an admin, in the light theme (the theme changes only colours,
whose contrast the a11y suite checks in both), and on the introduction. One exception: findings
that name only Clerk's development domain (`*.clerk.accounts.dev`, whose Cloudflare cookies
are third-party) do not fail it, and `summary.json` lists them under `clerkDevOnly`. A
production Clerk instance on the app's own domain has none; with a development instance,
best practices measures 77 on every page for that reason alone.

## Coverage

Coverage has one standard for every package (`vitest.preset.ts`): at least 90 % of lines,
statements, functions and branches of everything under `src/`, files without tests included.
Only tests, test helpers and the generated Prisma client are left out. `@muni/db` is measured
over its unit and integration tests together, against the test database, so `pnpm coverage`
needs `pnpm db:up`. `pnpm coverage` runs the packages one after another: run side by side,
each vitest takes every core, and on a small machine (CI has four) the tests starve and time
out though nothing is wrong. Tests keep the default timeouts. In the web app, pages and server actions are unit-tested too: the tests
render async server components with mocked repositories (`apps/web/src/test/`). A view's
reads go straight to the read handler (`apps/web/src/test/reads.ts`), so a page test runs the same guard
and load as the real route, and `renderServer` waits until every read has answered.

## Gates

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
  - a word the [glossary](ui.md#glossary) replaced fails, in either locale.
- **Git hooks**: `pnpm install` installs lefthook (`lefthook.yml`). A commit runs Prettier and each package's ESLint on the staged files only; everything else stays in `pnpm check` and CI.

Playwright e2e and Lighthouse are not in `pnpm check` (they need browsers, a production build, the test database and Clerk) but CI runs them in a second job, `e2e`: it builds, installs Chromium and runs every e2e spec (the register setup migrates and seeds the database first) (access, a11y, bookings, crud, import, layout, lists, register, signin) and Lighthouse; the visual shots are for review and stay local; on a failure it keeps the Playwright report and traces. Both jobs need the Clerk development keys as repository secrets, `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. The `check` job also runs `pnpm audit --prod --audit-level high`. Renovate (`renovate.json`) opens one pull request a week for minor and patch updates, and holds TypeScript below 7 and the prisma packages together.
