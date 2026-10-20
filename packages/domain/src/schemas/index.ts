// Normalised records. The importer produces them; the server re-validates them on commit;
// the edit forms use the same shapes. Validation failures surface as zod issue codes,
// which the web app translates (forms.errors.<code>).
export * from './completions'
export * from './courses'
export { APP_ID_PREFIX } from './fields'
export * from './people'
export * from './providers'
export * from './rooms'
export * from './sessions'
