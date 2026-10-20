# /plan

## Overview

Produce an implementation plan for a feature or change before writing code.

## Steps

1. Read the relevant [`.ai/rules/`](../rules/) and the code paths involved.
2. Name the package each change belongs in ([architecture.md](../rules/architecture.md)): policy
   in `@muni/domain`, generic helpers in `@muni/utils`/`@muni/ui`, a domain's UI in
   `apps/web/src/features/<domain>/`. A module move is a repo-wide sweep.
3. Name the existing pieces to reuse before proposing new ones: `sessionIssues`, `roomFit`,
   `bookingState`, `ScheduleSessionButton`, `SessionBookings`, the Book… dialog, `FormShell`,
   `DataTable` with `pageOf`/`useListUrl`, `table-columns` helpers.
4. For a schema change: the migration SQL, its backfill, and the dev-copy rehearsal
   ([data.md](../rules/data.md)).
5. Call out the gate impact: new branches to cover, messages (both locales, glossary), the e2e
   spec and visual shots that show the change.

## Output

A concise plan: context, the change per file, what is reused, and how to verify end-to-end
(`pnpm check:changed`, `pnpm check`, the e2e spec, the screenshots to read).
