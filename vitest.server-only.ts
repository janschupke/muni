// What `server-only` is in tests: nothing. Vitest runs outside the react-server condition,
// where the real module throws (vitest.preset.ts aliases it here for every package).
export {}
