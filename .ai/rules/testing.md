# Testing

Vitest in every package (unit; db also integration against the test database on :5439),
Playwright for e2e, visual shots and Lighthouse on the production build. Deep reference:
[docs/testing.md](../../docs/testing.md).

## Rules

- **Test where the code lives,** one test file per module, next to it. A route's page test sits
  in its route folder. No catch-all test files.
- **Web tests run on a pinned day** (`src/test/clock.ts`, set before each test): the fixtures
  are dated around it. Never compare against the real clock.
- **Test with realistic input:** spaces, Czech diacritics, punctuation, blanks, the verbatim
  example from the request.
- **A new branch needs a test** (90 % per package). Integration tests assert every write's
  result: an unchecked refusal hides a broken test.
- **e2e runs the production build.** Rebuild (`pnpm --filter @muni/web build`) after every UI
  change, then run one spec file at a time. If the setup project times out reaching Clerk,
  see [troubleshooting](../../docs/testing.md#troubleshooting).
- **e2e signs in for real** through the Clerk development instance; the setup project creates
  the three users. Never automate against live user data or a real profile.
- **Never run two suites at once;** they share the test database and the machine. Capture a
  slow run's output to a file once and read it once.
- **Playwright traps:** `aria-disabled` counts as disabled (press from the keyboard); a role
  name is a substring match (use `exact: true`); wait for `html[data-hydrated]` after `goto`;
  a tooltip that repeats its trigger's name is `aria-hidden` (`includeHidden: true`).
- **Mocks are per file.** Vitest applies `vi.mock` only from the test file or setupFiles; share
  a mock as a factory (`vi.mock(path, () => repoMock())`). `vi.mock` path strings are not
  type-checked: grep them after a move.
