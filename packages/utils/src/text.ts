/**
 * Czech collation for sorting what people read: case and accents count only as a last resort
 * (`sensitivity: 'base'` ties them), numbers by value ("Učebna 2" before "Učebna 10").
 */
export const czechCollator = new Intl.Collator('cs', { numeric: true, sensitivity: 'base' })

/** `a.localeCompare(b, 'cs')`, made once: Czech order, case and accents breaking ties. */
export const compareCs = new Intl.Collator('cs').compare

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
function neutralizeFormula(value: string): string {
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

const COMPANY_ID_WEIGHTS = [8, 7, 6, 5, 4, 3, 2]

/**
 * Whether `value` is a Czech company ID (IČO): 8 digits, the last a mod-11 check digit of
 * the first seven weighted 8 down to 2 (a remainder of 0 gives 1, of 1 gives 0).
 */
export function isCompanyId(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false
  const sum = COMPANY_ID_WEIGHTS.reduce((n, w, i) => n + w * Number(value[i]), 0)
  const remainder = sum % 11
  const check = remainder === 0 ? 1 : remainder === 1 ? 0 : 11 - remainder
  return Number(value[7]) === check
}
