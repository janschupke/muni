# Import files

The files to import into a new register. They are derived from the raw exports in `data/`
by `pnpm data:derive` (`packages/db/scripts/derive-import-data.ts`, rules in
`packages/importer/src/derive/derive.ts`). Do not edit them by hand: change the rules and run
it again. A test fails when these files differ from what the script writes.

The raw exports stay as they are: they are the defects the importer is tested against.

## What is here

| File                      | What                                                              |
| ------------------------- | ----------------------------------------------------------------- |
| `katalog_skoleni.csv`     | courses: code, name, validity in months, who must hold them       |
| `zamestnanci.csv`         | people                                                            |
| `mistnosti.csv`           | rooms (the exports only name them): kind and seats                |
| `terminy_skoleni.csv`     | sessions                                                          |
| `absolvovana_skoleni.csv` | completions                                                       |
| `review/inferences.csv`   | every value these files hold that the exports did not say as such |
| `review/ambiguities.csv`  | every export row left out, or kept but worth a look               |

The five import files are UTF-8, comma-separated, with the exports' Czech headers, ISO dates
(`2026-10-14`) and plain prices (`450`, `1200.50`). The `review/` lists are for a person; no
import reads them.

## Counts

Rows of each export written here, and left out (each left-out row is in
`review/ambiguities.csv` with its reason):

| Export                    | Written | Left out |
| ------------------------- | ------- | -------- |
| `katalog_skoleni.csv`     | 10      | 0        |
| `zamestnanci.csv`         | 170     | 4        |
| `terminy_skoleni.csv`     | 32      | 2        |
| `absolvovana_skoleni.csv` | 2814    | 52       |

Plus 9 rooms in `mistnosti.csv`.

## Rules

What the importer reads from the exports is written back as it reads it: course codes
(`bozp_z` → `BOZP-Z`), names, department and provider spellings, emails without spaces,
dates, prices (`zdarma` → 0), formulas stripped from notes, a duplicate person's completions
moved to the person kept. Each such change is a row in `review/inferences.csv`, named by the
importer's warning code.

On top of that, these decisions, each also listed in `review/inferences.csv`:

| Rule                         | What                                                                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COURSE_CODE_TYPO`           | `KYB3R` is KYBER (3 typed for E; T010 has KYBER's time, place and price). Only this one: `BOZP-X` is one letter from BOZP-Z, but its rows have another provider, price and validity, so they are left out. |
| `EMAIL_DOMAIN`               | `…@vzorova` gets the domain every other address has: `…@vzorova.example`.                                                                                                                                  |
| `VALIDITY_FROM_COURSE`       | An expiry that contradicts the course's validity is the course's: completion date plus the course's months.                                                                                                |
| `VALIDITY_BEFORE_COMPLETION` | An expiry before the completion date is worked out the same way.                                                                                                                                           |
| `NEGATIVE_PRICE`             | A negative price is left out; the completion stays.                                                                                                                                                        |
| `ROOM_KIND_FROM_NAME`        | A room's kind is the one its name implies (`Laboratoř 3` is a lab, `Online` online, the rest classrooms).                                                                                                  |
| `ROOM_SEATS_FROM_SESSIONS`   | A room's seats are those of the largest planned session held there.                                                                                                                                        |

The expiries and what counts as "in the future" are judged on 20 October 2026, the day the
files were derived.

## Left out

Rows a person has to decide on, in `review/ambiguities.csv` as `left out`:

- **The ID names one person and the name another** (`NAME_OF_ANOTHER_EMPLOYEE`, 5
  completions): neither can be trusted.
- **Trainings dated in the future** (`FUTURE_COMPLETION`, 5, "zadáno předem"): not held yet.
- **The same record again under another ID** (`DUPLICATE_RECORD`: 10 completions, session
  T009) and repeated IDs (`DUPLICATE_ID`, 15).
- **Unknown people and courses** (`EMPLOYEE_NOT_FOUND` E9001–E9009, `COURSE_NOT_FOUND`
  BOZP-X and GDPR-2).
- **No real date** (`PLACEHOLDER_DATE` 1900, `INVALID_DATE` 31. 9.), the totals row, and the
  four people exported twice (`DUPLICATE_PERSON`; their completions are moved).

Kept, but listed as `kept` for a look: people in no department or not at work yet, trainings
after the person left, planned sessions whose day has passed or falls on a day off, sessions
overbooked or with no seats. The comment in the completions export (line 612, "nezapočítávat
do statistik", do not count in the statistics) is listed as `noted`: it does not say which
rows it means.
