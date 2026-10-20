/**
 * Whether Prisma threw this error code: `P2002` a unique key taken, `P2025` a record not
 * found. The one place that reads the code off an unknown error.
 */
export function isPrismaCode(error: unknown, code: 'P2002' | 'P2025'): boolean {
  return (error as { code?: unknown } | null)?.code === code
}
