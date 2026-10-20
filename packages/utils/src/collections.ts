/** The most frequent value; ties go to the one `compare` puts first. Undefined for none. */
export function mostCommon<T>(values: Iterable<T>, compare: (a: T, b: T) => number): T | undefined {
  const counts = new Map<T, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]))[0]?.[0]
}
