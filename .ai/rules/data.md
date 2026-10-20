# Data

Postgres through Prisma 7. Invariants are enforced by the database where they can be (CHECKs,
partial unique indexes, RESTRICT foreign keys) and by repositories under locks where they
cannot. Deep reference: [README § Data model](../../README.md#data-model) and
[§ Archiving](../../README.md#archiving).

## Rules

- **Archive, never delete.** Records that carry history get `archived_at`/`archived_by_id`;
  only bookings and join rows are deleted. Every FK is `ON DELETE RESTRICT`, and the db lint
  rule bans `.delete(` elsewhere (allow-list: `JOIN_ROWS` in `packages/db/eslint.config.js`).
- **Every unique lookup spreads `...ACTIVE`.** Partial uniques (`WHERE archived_at IS NULL`)
  still appear in Prisma's `WhereUniqueInput`, so `findUnique({ where: { name } })` compiles
  and can return an archived row; the db lint rule demands `...ACTIVE`.
- **Archived people are anonymised** for every role except the admin's archived page;
  `archive.integration.test.ts` sweeps every repository read. A new read joins that sweep.
- **A session still to start is cancelled, not archived** (`sessionPhase`); the edit form
  never changes its status.
- **A session derives from its course and provider:** the provider must offer the course
  (`provider_courses`), the end is start + `Course.sessionMinutes`, the price is the
  offering's, copied when scheduled or when course or provider changes (`derive()` in
  `repositories/records/mutations.ts`). Imported sessions keep their exported times and price.
- **One active default provider** (partial unique); imported sessions naming none go to it;
  it cannot be archived.
- **Session writes take the sessions lock and the row lock** (`lockSessionWrites`,
  `SELECT … FOR UPDATE`) and re-check fit, clashes, seats and need on the server; the
  browser's plan is never trusted.
- **Only what a person needs is booked** (`needsBooking`): required, not held, nothing booked,
  employed. The server checks it for every booking.
- **Urgency is one order everywhere:** EXPIRED, then MISSING, then EXPIRING, then VALID
  (`compareUrgency` in `@muni/domain/compliance`).
- **Migrations are SQL you read.** Write them with `prisma migrate diff` (it renders a rename as
  drop + add: fix that by hand), keep CHECKs and partial indexes in the SQL, and verify a
  backfill on a restored copy of the dev database (`pg_dump` → restore → `migrate deploy`)
  before the dev database. Never apply to production by hand.
- **Prisma refuses `migrate reset` from an agent.** Use `migrate deploy` and re-runnable tests.
- **Repositories return sanitised DTOs**; `toAmount` converts decimals; date-only values are
  `date` columns formatted as UTC.
