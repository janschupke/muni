import { fold } from '@muni/utils/text'

/**
 * Known abbreviations that folding alone cannot join. Keys and values are fold keys.
 * Extend this when a new export introduces another variant.
 */
export const DEPARTMENT_ALIASES: Record<string, string> = {
  studijni: 'studijni oddeleni',
  personalni: 'personalni oddeleni',
  ekonomicke: 'ekonomicke oddeleni',
  it: 'it oddeleni',
}

/**
 * Maps spelling variants onto one canonical spelling per fold key.
 * A spelling that already exists in the database wins; otherwise the most frequent
 * variant in the batch wins (first seen on a tie).
 */
export class Canonicalizer {
  private readonly canonicalByKey = new Map<string, string>()

  constructor(
    values: Iterable<string>,
    existing: Iterable<string> = [],
    private readonly aliases: Record<string, string> = {}
  ) {
    const counts = new Map<string, Map<string, number>>()
    for (const value of values) {
      const key = this.keyOf(value)
      const variants = counts.get(key) ?? new Map<string, number>()
      variants.set(value, (variants.get(value) ?? 0) + 1)
      counts.set(key, variants)
    }
    for (const [key, variants] of counts) {
      let best = ''
      let bestCount = 0
      for (const [variant, count] of variants) {
        // An alias spelling ("Studijní") never beats the full name it abbreviates.
        const penalty = fold(variant) === key ? 0 : 0.5
        if (count - penalty > bestCount) {
          best = variant
          bestCount = count - penalty
        }
      }
      this.canonicalByKey.set(key, best)
    }
    for (const value of existing) this.canonicalByKey.set(this.keyOf(value), value)
  }

  keyOf(value: string): string {
    const key = fold(value)
    return this.aliases[key] ?? key
  }

  canonical(value: string): string {
    return this.canonicalByKey.get(this.keyOf(value)) ?? value
  }

  has(value: string): boolean {
    return this.canonicalByKey.has(this.keyOf(value))
  }
}
