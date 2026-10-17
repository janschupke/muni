export type MoneyParseResult =
  | { ok: true; value: number; note?: 'free' }
  | { ok: false; reason: 'empty' | 'unparseable' | 'negative' }

const FREE_WORDS = new Set(['zdarma', 'free', 'zdarma.'])

/**
 * Parses CZK amounts as written in Czech spreadsheets:
 * `"450,00"`, `"1 200,00"`, `"2 100 Kč"`, `"450,- Kč"`, `"zdarma"`.
 * Returns the amount in crowns rounded to hellers (2 dp).
 */
export function parseCzk(raw: string | null | undefined): MoneyParseResult {
  const value = (raw ?? '').trim()
  if (value === '') return { ok: false, reason: 'empty' }
  if (FREE_WORDS.has(value.toLocaleLowerCase('cs'))) return { ok: true, value: 0, note: 'free' }

  const compact = value
    .replace(/kč|czk/gi, '')
    .replace(/[\s\u00a0]/g, '')
    .replace(/,-$/, '')
    .replace(',', '.')

  if (!/^-?\d+(\.\d{1,2})?$/.test(compact)) return { ok: false, reason: 'unparseable' }
  const amount = Math.round(Number(compact) * 100) / 100
  if (amount < 0) return { ok: false, reason: 'negative' }
  return { ok: true, value: amount }
}

/** Parses a non-negative whole number (`"25"`, `" 40 "`). */
export function parseCount(raw: string | null | undefined): number | null {
  const value = (raw ?? '').trim()
  if (!/^\d+$/.test(value)) return null
  return Number(value)
}

/**
 * An amount typed into a field, read as the imports read it (`1 200,50 Kč`, `450,-`,
 * `zdarma`): null when empty, undefined while it is not an amount (or is negative).
 */
export function parseAmount(raw: string | null | undefined): number | null | undefined {
  const parsed = parseCzk(raw)
  if (parsed.ok) return parsed.value
  return parsed.reason === 'empty' ? null : undefined
}
