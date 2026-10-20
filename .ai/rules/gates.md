# Gates

**`pnpm check` is the full gate; `pnpm check:changed` is what to run after each change.**
Deep reference: [docs/testing.md](../../docs/testing.md).

`pnpm check` runs, in order (the same steps as `.github/workflows/check.yml`):

```
pnpm format:check      # Prettier; `pnpm format` rewrites, the gate only verifies
pnpm lint              # every package's ESLint + the root files, zero warnings
pnpm typecheck         # tsc in every package + the root files
pnpm knip              # unused files, exports, dependencies (dev and production)
pnpm check:schema      # prisma validate + format --check
pnpm check:drift       # migrations reproduce schema.prisma (test database)
pnpm coverage          # every package's tests, 90 % lines/statements/functions/branches
pnpm test:root         # the repo's own scripts (scripts/*.test.ts)
pnpm build             # next build
```

It needs the test database (`pnpm db:up`). Playwright and Lighthouse are not in it.

## Rules

- **After each change, `pnpm check:changed`.** It maps the changed files (uncommitted and
  untracked; `--base <ref>` for more) to the checks that cover them and runs them one at a
  time: Prettier on the files; ESLint, typecheck and the related tests of the package and
  every package that imports it (ESLint on only the changed files when only tests changed); knip, the source-scanning suites, the related db integration
  tests, and the schema checks for a Prisma change. A shared config change asks for the full
  gate. `--dry-run` prints the plan.
- **Before calling a task done, `pnpm check`.** Fix a finding at its root; never widen an
  ignore, lower a threshold or add an `eslint-disable`.
- **The UI is not done until it is seen.** After a web or ui change: rebuild
  (`pnpm --filter @muni/web build`), run the e2e spec that covers it (one file at a time) and
  `pnpm test:visual`, and read the changed screenshots in both themes. `check:changed` prints
  this reminder.

| Changed                                                                     | Also run                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/db/prisma/**`                                                     | `db:generate`, `check:schema`, `check:drift`, `test:integration`      |
| `packages/db/src/**`                                                        | the related integration tests (needs `db:up`)                         |
| `apps/web/src/i18n/messages/**`                                             | `messages-parity.test.ts` (keys, ICU, glossary, unused keys)          |
| `apps/web/src/**` (any source)                                              | `messages-parity.test.ts`, `format-rate.test.ts`, ui `tokens.test.ts` |
| `packages/ui/src/styles/**`                                                 | `tokens.test.ts` (the colour contract)                                |
| a Markdown file, or a file moved or deleted                                 | `scripts/docs-paths.test.ts` (every path the docs name exists)        |
| a page, form, dialog or table                                               | rebuild, the covering e2e spec, `a11y.spec.ts`, visual shots          |
| `tsconfig*`, `eslint.preset.js`, `vitest.preset.ts`, `turbo.json`, lockfile | `pnpm check`                                                          |

- **Git hooks** (`lefthook.yml`): a commit runs Prettier and ESLint on the staged files; a push
  runs `check:changed --base auto` (the upstream, else `origin/main`).
- **Coverage is per package, 90 % of everything under `src/`**, untested files included. A new
  branch needs a test.
