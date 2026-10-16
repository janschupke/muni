import type { SanitizePolicy } from './policy'

/**
 * Default field policy. Every field listed here is sensitive and is passed through
 * `sanitizeRecord` before it leaves the server. Override per deployment with the
 * MUNI_SANITIZE_POLICY env var (JSON, merged over this object).
 */
export const defaultPolicy = {
  'employee.nationalId': {
    anonymous: { mode: 'omit' },
    authenticated: { mode: 'mask', keepLast: 4 },
  },
  'employee.email': {
    anonymous: { mode: 'maskEmail' },
    authenticated: { mode: 'show' },
  },
  'employee.note': {
    anonymous: { mode: 'omit' },
    authenticated: { mode: 'show' },
  },
  'completion.note': {
    anonymous: { mode: 'omit' },
    authenticated: { mode: 'show' },
  },
  'completion.price': {
    anonymous: { mode: 'show' },
    authenticated: { mode: 'show' },
  },
} as const satisfies SanitizePolicy
