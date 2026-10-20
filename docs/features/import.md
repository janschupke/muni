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
  chunks of 500.
  The server re-validates every record with the domain schemas before writing.

What the importer does with the defects in `data/`:

| Defect                                                   | Result                                       |
| -------------------------------------------------------- | -------------------------------------------- |
| `d. m. yyyy`, `dd.mm.yyyy`, ISO dates                    | read silently                                |
| Excel serial dates (`43552`)                             | read, warning                                |
| `1900-01-01` placeholders, impossible dates (`31. 9.`)   | error                                        |
| `BOZP_Z`, ` kyber`                                       | normalised course code, warning              |
| unknown codes (`KYB3R`, `BOZP-X`)                        | error (no fuzzy guessing)                    |
| department and provider spelling variants                | unified to the most common spelling, warning |
| same person twice (same email or birth number)           | later row rejected; their records remapped   |
| employees that do not exist (`E9001`)                    | error                                        |
| duplicate record IDs                                     | the repeat is rejected                       |
| `zdarma`, `450,- Kč`, `2 100 Kč`                         | parsed; negative prices are errors           |
| spreadsheet formulas in notes (`=HYPERLINK(…)`)          | formula trigger removed, warning             |
| blank lines, repeated header, `#` comments, `Celkem` row | skipped                                      |
| missing validity date                                    | derived from the course validity, warning    |

`packages/importer/src/fixtures.test.ts` runs the importer over the real files and pins
these outcomes and the totals.
