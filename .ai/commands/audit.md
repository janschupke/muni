# /audit

## Overview

Analysis-only pass over a slice of the codebase. Produces findings; changes nothing.

## Steps

1. Scope the audit to a package, a feature folder or a concern.
2. Check against the rules: the import graph and where code goes
   ([architecture.md](../rules/architecture.md)), the data invariants ([data.md](../rules/data.md)),
   the UI rules ([ui.md](../rules/ui.md)), messages ([i18n.md](../rules/i18n.md)).
3. Flag, with file:line and a severity:
   - policy re-derived outside `@muni/domain`, and helpers duplicated across packages;
   - components over ~200 lines, more than one exported component per file, logic in a
     component body that belongs in a hook;
   - functions over ~80 lines, parallel `switch` blocks over the same kinds;
   - dead code (`pnpm knip` misses exports used only in their own file);
   - tests that depend on the real date, catch-all test files, untested branches;
   - docs that name files or functions that no longer exist.

## Output

A ranked findings list (file:line, one-line description, severity). No edits.
