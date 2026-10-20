/** A cell quoted only when it has to be: a delimiter, a quote or a line break in it. */
function cell(value: string | number | null): string {
  const text = value === null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/**
 * A CSV file the importer reads as written: UTF-8 without a byte order mark, `,` between
 * cells, `\n` between lines, a header first and a line break at the end.
 */
export function toCsv(header: readonly string[], rows: readonly (string | number | null)[][]) {
  return [header, ...rows].map(row => row.map(cell).join(',')).join('\n') + '\n'
}
