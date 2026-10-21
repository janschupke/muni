# Architecture

A pnpm + Turborepo monorepo: one Next.js 16 app over five internal packages that ship
TypeScript source (no build step). Deep reference: [docs/architecture.md](../../docs/architecture.md).

## The shape

| Package          | Holds                                                                                    | Imports                 |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------- |
| `@muni/utils`    | pure helpers: text folding, dates (luxon, Europe/Prague), money, formatting              | nothing internal        |
| `@muni/domain`   | enums, zod schemas, the rules: compliance, rooms, sessions, advisor, planner, sanitising | utils                   |
| `@muni/importer` | CSV decoding, parsing, row and cross-file validation; runs in the browser and Node       | domain, utils           |
| `@muni/db`       | Prisma schema and migrations, repositories (sanitised DTOs), import writer, seed         | domain, importer, utils |
| `@muni/ui`       | tokens and components (Tailwind 4, Radix, TanStack Table); never imports Next            | nothing internal        |
| `@muni/web`      | pages, reads, server actions, features                                                   | everything              |

## Rules

- **The import graph is the table above, and it is a DAG.** `import-x/no-cycle` is on; a cycle
  is fixed by moving the shared piece down a layer, never by disabling the rule.
- **Policy lives in `@muni/domain`.** A rule the server, the forms and the planner must agree on
  (room fit, `sessionIssues`, `bookingState`, compliance status) is written once there and
  called from everywhere. A component or a repository that re-derives one is a bug in waiting.
- **Generic code lives in `@muni/utils` or `@muni/ui`.** Collation (`compareCs`), date math,
  `mostCommon`-style helpers are not re-written per file.
- **Pages never read Prisma models.** Repositories in `@muni/db/repositories` return plain,
  sanitised DTOs; the policy (`sanitize.config.ts`) is applied there.
- **`server-only` is a build-time fence.** `@muni/db`'s client, repositories, writer and
  reference import it; scripts and tests open their own client from `@muni/db/connect`.
- **Web layout:** `app/` holds routes (server guards and prefetch only, and a `loading.tsx`
  beside every page that renders its view's exported loading state); `features/<domain>/`
  holds that domain's views, tables, forms and hooks; `components/` holds only what no single
  domain owns (shell, navigation, page scaffolds, the form kit, badges); `lib/` holds
  browser-and-server helpers; `server/` holds reads, actions and auth.
- **One component per file**, plus private leaf parts. Logic in a component body that is not
  rendering (state machines, derived drafts, effects) goes into a named `useX` hook beside it,
  or into a domain function when it is policy.
- **`@muni/ui` exports one subpath per component** (`@muni/ui/data-table`); moving a file inside
  the package changes only its `exports` map.
- **Moving a module is a repo-wide sweep:** imports, `vi.mock` path strings (the type checker
  does not see them), eslint `files`/`ignores`, knip entries, tests that scan the tree from a
  relative path, and doc links. `pnpm check:changed` then `pnpm check`.
