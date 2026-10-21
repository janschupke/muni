/** What a spreadsheet would run as a formula if a cell starts with it. */
const FORMULA = /^[=+\-@\t\r]/

/**
 * A cell quoted only when it has to be: a delimiter, a quote or a line break in it. For a
 * file a person opens in a spreadsheet, a cell that would start a formula is kept as text
 * (`'` before it).
 */
function cell(value: string | number | null, forPeople: boolean): string {
  const raw = value === null ? '' : String(value)
  const text = forPeople && FORMULA.test(raw) ? `'${raw}` : raw
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * A CSV file the importer reads as written: UTF-8 without a byte order mark, `,` between
 * cells, `\n` between lines, a header first and a line break at the end. `forPeople`: a list
 * for a person to open (the review files), never to import: formulas are neutralised.
 */
export function toCsv(
  header: readonly string[],
  rows: readonly (string | number | null)[][],
  { forPeople = false }: { forPeople?: boolean } = {}
) {
  return (
    [header, ...rows].map(row => row.map(value => cell(value, forPeople)).join(',')).join('\n') +
    '\n'
  )
}
