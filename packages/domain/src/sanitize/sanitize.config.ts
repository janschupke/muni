import type { SanitizePolicy } from './policy'

/**
 * Default field policy. Every field listed here is sensitive and is passed through
 * `sanitizeRecord` before it leaves the server. VIEWER (the role every new sign-up gets)
 * sees personal data redacted; FULL and ADMIN see whole records. Override per deployment
 * with the MUNI_SANITIZE_POLICY env var (JSON, merged over this object).
 */
export const defaultPolicy = {
  'employee.nationalId': {
    VIEWER: { mode: 'omit' },
    FULL: { mode: 'show' },
    ADMIN: { mode: 'show' },
  },
  'employee.email': {
    VIEWER: { mode: 'maskEmail' },
    FULL: { mode: 'show' },
    ADMIN: { mode: 'show' },
  },
  'employee.note': {
    VIEWER: { mode: 'omit' },
    FULL: { mode: 'show' },
    ADMIN: { mode: 'show' },
  },
  'completion.note': {
    VIEWER: { mode: 'omit' },
    FULL: { mode: 'show' },
    ADMIN: { mode: 'show' },
  },
  'completion.price': {
    VIEWER: { mode: 'show' },
    FULL: { mode: 'show' },
    ADMIN: { mode: 'show' },
  },
} as const satisfies SanitizePolicy
