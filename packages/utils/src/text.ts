/** Collapses runs of whitespace (incl. NBSP) into one space and trims. */
export function collapseWhitespace(value: string): string {
  return value.replace(/[\s\u00a0]+/g, ' ').trim()
}

/**
 * Comparison key: lowercase, no diacritics, single spaces.
 * `"SPRÁVA  BUDOV"`, `"Sprava budov"` and `"správa budov"` all fold to `"sprava budov"`.
 */
export function fold(value: string): string {
  return collapseWhitespace(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('cs')
}

/** `"  LUCIE"` → `"Lucie"`, `"jan-petr"` → `"Jan-Petr"`. */
export function titleCase(value: string): string {
  return collapseWhitespace(value)
    .toLocaleLowerCase('cs')
    .replace(/(^|[\s-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toLocaleUpperCase('cs'))
}

/** True when a spreadsheet would evaluate the cell as a formula. */
export function isFormulaLike(value: string): boolean {
  return /^[=+\-@\t\r]/.test(value.trimStart())
}

/**
 * Neutralises spreadsheet-formula payloads in free text (CSV injection).
 * The text is kept; only the leading trigger characters are removed.
 */
export function neutralizeFormula(value: string): string {
  return value.trimStart().replace(/^[=+\-@\t\r]+/, '')
}

/** Cleans a free-text value: neutralises formulas, tidies whitespace per line, empty → null. */
export function cleanFreeText(value: string | null | undefined): string | null {
  if (value == null) return null
  const cleaned = neutralizeFormula(value)
    .split(/\r?\n/)
    .map(collapseWhitespace)
    .filter(line => line !== '')
    .join('\n')
  return cleaned === '' ? null : cleaned
}
