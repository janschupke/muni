# muni — Claude Instructions

This file is a pointer. All detailed rules and commands live in [`.ai/`](.ai/) — the single source of truth.

## Project

**muni** is a register of mandatory staff training: who holds which course, what expires,
what is scheduled, who is booked. Next.js 16 (App Router) over Postgres (Prisma 7), Clerk for
sign-in and roles (viewer, full, admin), next-intl (cs/en), Tailwind 4. A pnpm + Turborepo
monorepo; internal packages ship TypeScript source.

### Source layout

- `apps/web` — the app: `src/app/` routes (server guards and prefetch), `src/features/<domain>/`
  views, tables, forms and hooks, `src/components/` shared shell, scaffolds and form kit,
  `src/server/` reads, actions and auth, `src/lib/` helpers, `e2e/` Playwright
- `packages/domain` — enums, zod schemas, and the rules: compliance, rooms, sessions, advisor,
  planner, sanitising
- `packages/db` — Prisma schema and migrations, repositories (sanitised DTOs), the import
  writer, the seed
- `packages/importer` — CSV decoding, parsing and validation (browser and Node)
- `packages/ui` — design tokens and components
- `packages/utils` — text, dates, money, formatting
- `scripts/` — repo tooling (`check-changed.ts`, `docs-paths.test.ts`)
- `docs/` — how it works, in depth: architecture, data model, UI, colour, features, testing,
  deployment

## Rules

- [Architecture](.ai/rules/architecture.md) — the package DAG, where code goes, one component
  per file, moving a module is a sweep
- [Gates](.ai/rules/gates.md) — `pnpm check:changed` after each change, `pnpm check` before
  done, the path → checks table
- [Data](.ai/rules/data.md) — archive never delete, `...ACTIVE`, locks, offerings and the
  session derivation, migrations rehearsed on a dev copy
- [UI](.ai/rules/ui.md) — fields never change each other, writes ask and toast, one way to
  book and schedule, server paging
- [Messages](.ai/rules/i18n.md) — parity, families, the glossary
- [Testing](.ai/rules/testing.md) — layers, the pinned clock, e2e on the production build
- [Colour](.ai/rules/colour.md) — tokens, roles, the colour contract

## Commands

[/plan](.ai/commands/plan.md) · [/audit](.ai/commands/audit.md) · [/bugfix](.ai/commands/bugfix.md) · [/refactor](.ai/commands/refactor.md)

## Critical rules (excerpt)

The most-violated. Full set in [`.ai/rules/`](.ai/rules/).

- **`pnpm check:changed` after each change, `pnpm check` before done.** Fix at the root;
  never widen an ignore or lower a threshold.
- **Never push, never branch:** commit on `main` when asked; pushing is the owner's.
- **Policy lives once in `@muni/domain`.** No component, repository or importer rule
  re-derives it.
- **Archive, never delete;** every unique lookup spreads `...ACTIVE`.
- **A form field never changes another field;** a derived value is a `FieldValue`, not an
  input.
- **The UI is done when it is seen:** rebuild, the covering e2e spec, the visual shots, both
  themes read.
- **Never apply a migration to production by hand;** rehearse a backfill on a dev copy.
