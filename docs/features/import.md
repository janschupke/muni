# Importing

The CSV import wizard, its checks, and what it does with the defects in `data/`.

The wizard at `/import` has four steps: upload, review, confirm, progress.

- **Upload:** files are recognised by their header, not their name. Encoding (UTF-8 with or
  without BOM, Windows-1250) and delimiter (`,` `;` tab) are detected.
- **Review:** rows with an **error** are skipped. Rows with a **warning** are imported with the
  fix described, except rows that touch an archived record (`ARCHIVED`), which are skipped. Cells can be edited inline, rows removed, restored or reverted, and every
  change re-validates the whole batch, including references between files.
- **Rooms:** an optional `mistnosti.csv` (`nazev`, `typ`, `kapacita`, `vybaveni`; equipment
  as codes or Czech labels, `;`- or `,`-separated). Without one, each place the sessions name
  becomes a room (`ROOM_DERIVED`, once per room) of the kind its name implies ("Laboratoř 3"
  is a lab), sized by the largest session held there; spelling variants of a known room are
  unified, in a rooms file too. A rooms file without an equipment column leaves equipment as
  it is.
- **Same rules as the forms, as warnings:** a planned session in a room too small for it
  (`ROOM_TOO_SMALL`), lacking what the course needs (`ROOM_UNSUITABLE`) or taken then by
  another (`ROOM_BUSY`); a manager link that would make someone manage themselves is
  dropped (`MANAGER_CYCLE`). Each department, position and provider the import will create is
  named once (`WILL_CREATE`). Someone who left needs a leaving date (`LEFT_WITHOUT_DATE`).
- **Providers:** a sessions file may name each session's provider (`poskytovatel` or
  `provider`). A named provider must exist and offer the course (`PROVIDER_UNKNOWN`,
  `PROVIDER_NOT_OFFERING`, errors). A session that names none goes to the default provider;
  with no default the row is refused (`NO_DEFAULT_PROVIDER`), and a course the default does
  not offer yet is added to its offerings at the row's price (`OFFERING_ADDED`, a warning).
  A completions file adds an offering for each provider and course it shows delivered and
  not offered yet, at the latest price paid; it never changes an existing offering.
- **Commit:** in dependency order (rooms, courses, employees, completions, sessions), in
  chunks of 500 (`COMMIT_CHUNK_SIZE`), each one transaction. People are written managers
  first, so every manager link finds its manager written, however many chunks they take.
  The server re-validates every record with the domain schemas before writing; a record
  naming something the register does not have is refused by name (`REFERENCE_MISSING`).
- **After a dataset's last chunk,** what needs all of it is worked out once, filling only
  what is not set:
  - after the people, a head for each department without one, from the reporting lines;
  - after the completions, an offering of each course a provider's completions show, at
    the latest price paid, and, with no default provider, a default: "Interní školitel" if
    it is there, else the provider with the most completions.
- **A refused chunk** changes nothing; the chunks before it stay written. Importing the same
  files again is safe: records are matched by ID (courses by code, rooms by name), and one
  the register already holds as it is is not written at all (its `updatedAt` stays). The
  summary counts each dataset's records as created, updated, unchanged and skipped.

What the importer does with the defects in `data/`:

| Defect                                                   | Result                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `d. m. yyyy`, `dd.mm.yyyy`, ISO dates                    | read silently                                                       |
| Excel serial dates (`43552`)                             | read, warning                                                       |
| `1900-01-01` placeholders, impossible dates (`31. 9.`)   | error                                                               |
| `BOZP_Z`, ` kyber`                                       | normalised course code, warning                                     |
| unknown codes (`KYB3R`, `BOZP-X`)                        | error, naming a single code one letter away ("did you mean KYBER?") |
| department and provider spelling variants                | unified to the most common spelling, warning                        |
| same person twice (same email or birth number)           | later row rejected; their records remapped                          |
| employees that do not exist (`E9001`)                    | error                                                               |
| duplicate record IDs                                     | the repeat is rejected                                              |
| the same record again under another ID (a re-export)     | rejected (`DUPLICATE_RECORD`)                                       |
| a completion dated in the future (entered in advance)    | error                                                               |
| `zdarma`, `450,- Kč`, `2 100 Kč`                         | parsed                                                              |
| a negative price                                         | left out, warning; the record stays                                 |
| validity ending before the completion                    | derived from the course validity, warning                           |
| missing validity date                                    | derived from the course validity, warning                           |
| a comma for the dot in an email domain (`@firma,cz`)     | read as the dot, warning                                            |
| spreadsheet formulas in notes (`=HYPERLINK(…)`)          | formula trigger removed, warning                                    |
| no department, not at work yet, a training after leaving | imported, warning                                                   |
| a planned session whose day has passed, or on a day off  | imported, warning                                                   |
| blank lines, repeated header, `#` comments, `Celkem` row | skipped                                                             |

`packages/importer/src/fixtures.test.ts` runs the importer over the real files and pins
these outcomes and the totals.

## Import files for a new register

The raw exports keep their defects: they are what the importer is tested against. A new
register is filled from `data/import/` instead, derived from them by `pnpm data:derive`
(rules in `packages/importer/src/derive/derive.ts`): the rows the importer would take,
written back canonical, a rooms file the exports lack, and two lists for a person:

- `data/import/review/inferences.csv`: every value the files hold that the exports did not say as such
  (a normalised code, a remapped person, an expiry from the course's validity, a room's
  seats).
- `data/import/review/ambiguities.csv`: every export row left out (refused, or a completion whose name
  belongs to another employee than its ID), the rows kept but worth a look, and the
  exports' comments.

`data/import/README.md` lists the rules and the counts; a test regenerates the files and
fails on any difference. How to import them on a new deployment: [deploy.md](../deploy.md#first-data).
