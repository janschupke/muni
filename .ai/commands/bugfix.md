# /bugfix

## Overview

Root-cause a bug and fix it with a regression test.

## Steps

1. Reproduce with a failing test at the right layer: a domain unit test for a rule, a db
   integration test for a write or a lock, a web test for a view, an e2e spec for a flow
   ([testing.md](../rules/testing.md)). Use realistic input.
2. Find the root cause; fix the whole predicate, not the one symptom, everywhere it is used.
   No retry or timeout hacks over a race: fix the race.
3. Keep the regression test; make sure it fails before the fix and passes after.

## Output

The fix and its regression test, `pnpm check:changed` then `pnpm check` green, and for a UI
bug the rebuilt app seen in both themes.
