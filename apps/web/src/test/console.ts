import { vi } from 'vitest'

// What the code logs during a test. An error or a warning nobody expected fails the test
// (setup.ts): it is either a bug, or a test that should say it expects it.

type Level = 'error' | 'warn'

let logged: string[] = []

const text = (value: unknown) => (value instanceof Error ? value.message : String(value))

/** Starts collecting `console.error` and `console.warn` (setup, before each test). */
export function watchConsole(): void {
  logged = []
  for (const level of ['error', 'warn'] as const)
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(`console.${level}: ${args.map(text).join(' ')}`)
    })
}

/** What was logged that no test expected (setup, after each test); empties the record. */
export function unexpectedLogs(): string[] {
  const out = logged
  logged = []
  return out
}

/**
 * The test expects the code to log at `level`: from here on that level is not collected.
 * The spy shows what was logged, for the test to check.
 */
export function expectLogged(level: Level) {
  return vi.spyOn(console, level).mockImplementation(() => undefined)
}
