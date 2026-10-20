# /refactor

## Overview

Restructure without changing behaviour. Audit first, then apply on approval.

## Steps

1. Audit the target (see [/audit](audit.md)); write down what moves where.
2. **Extract, don't re-patch.** Pull a cohesive, testable piece into its own module (a domain
   function, a `useX` hook, a component); leave glue where it belongs. Keep the layering
   ([architecture.md](../rules/architecture.md)).
3. Move files with `git mv`; then sweep every reference: imports, `vi.mock` path strings,
   eslint `files`/`ignores`, knip, tests that scan the tree, doc links.
4. Keep each step independently green (`pnpm check:changed`) and commit it on its own after
   `pnpm check`.

## Output

The refactor applied, the same tests passing (moved, not rewritten), `git diff -M` showing
renames for moved files, behaviour unchanged.
