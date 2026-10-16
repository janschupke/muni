import type { EmploymentStatus } from '@muni/domain/enums'
import { type EmployeeInput, employeeSchema } from '@muni/domain/schemas'
import type { IsoDate } from '@muni/utils/dates'
import { collapseWhitespace, fold, titleCase } from '@muni/utils/text'
import * as z from 'zod'

import { reservedId, type RowBuilder } from '../fields'
import type { RowMapResult } from '../types'

const STATUS_BY_FOLD: Record<string, EmploymentStatus> = {
  aktivni: 'ACTIVE',
  active: 'ACTIVE',
  rodicovska: 'PARENTAL_LEAVE',
  materska: 'PARENTAL_LEAVE',
  parental_leave: 'PARENTAL_LEAVE',
  ukoncen: 'TERMINATED',
  ukoncena: 'TERMINATED',
  ukonceno: 'TERMINATED',
  terminated: 'TERMINATED',
}

const emailSchema = z.email()

/** Names in all caps or all lower case get title-cased; mixed case is trusted. */
function personName(b: RowBuilder, field: string): string | null {
  const raw = b.raw(field)
  const value = b.required(field)
  if (value === null) return null
  const normalized =
    value === value.toLocaleUpperCase('cs') || value === value.toLocaleLowerCase('cs')
      ? titleCase(value)
      : value
  if (normalized !== raw) b.warn(field, 'NAME_NORMALIZED', { raw, value: normalized })
  return normalized
}

/** Strips stray whitespace and lower-cases. A value that still isn't an email becomes null. */
function normalizeEmail(b: RowBuilder, field: string): string | null {
  const raw = b.raw(field)
  if (raw.trim() === '') return null
  const value = raw.replace(/\s+/g, '').toLowerCase()
  if (!emailSchema.safeParse(value).success) {
    b.warn(field, 'INVALID_EMAIL', { raw: raw.trim() })
    return null
  }
  if (value !== raw) b.warn(field, 'EMAIL_NORMALIZED', { raw, value })
  return value
}

/**
 * Czech birth number (rodné číslo): YYMMDD/XXX(X). Checks the structure only: a real
 * date part, where months carry +50 for women and +20 for the post-2004 extension.
 * The mod-11 checksum is deliberately not enforced: synthetic and legacy registers
 * routinely fail it, and the number is not used as a key.
 */
function isPlausibleNationalId(value: string): boolean {
  const digits = value.replace('/', '')
  if (!/^\d{9,10}$/.test(digits)) return false
  const month = Number(digits.slice(2, 4)) % 50
  const realMonth = month > 20 ? month - 20 : month
  const day = Number(digits.slice(4, 6))
  return realMonth >= 1 && realMonth <= 12 && day >= 1 && day <= 31
}

function nationalId(b: RowBuilder): string | null {
  const raw = b.cell('nationalId')
  if (raw === '') return null
  const compact = raw.replace(/\s+/g, '')
  const match = /^(\d{6})\/?(\d{3,4})$/.exec(compact)
  if (!match) {
    b.warn('nationalId', 'NATIONAL_ID_INVALID', { reason: 'format' })
    return null
  }
  const value = `${match[1]}/${match[2]}`
  if (!isPlausibleNationalId(value)) b.warn('nationalId', 'NATIONAL_ID_INVALID', { reason: 'date' })
  return value
}

function status(b: RowBuilder): EmploymentStatus | null {
  const raw = b.required('status')
  if (raw === null) return null
  return (
    STATUS_BY_FOLD[fold(raw).replace(/\s+/g, '_')] ?? b.error('status', 'INVALID_STATUS', { raw })
  )
}

export function mapEmployee(b: RowBuilder, ctx: { today: IsoDate }): RowMapResult<EmployeeInput> {
  if (b.isSummaryRow('externalId')) return b.rejectSummary()

  const externalId = reservedId(b, b.required('externalId')?.toUpperCase() ?? null, 'employee')
  const firstName = personName(b, 'firstName')
  const lastName = personName(b, 'lastName')
  const email = normalizeEmail(b, 'email')
  const managerEmail = normalizeEmail(b, 'managerEmail')
  const hiredOn = b.date('hiredOn', { required: true })
  const leftOn = b.date('leftOn', { required: false })
  const employmentStatus = status(b)

  if (employmentStatus === 'TERMINATED' && leftOn === null && !b.hasErrors) {
    b.warn('leftOn', 'STATUS_DATE_MISMATCH', { status: employmentStatus })
  }
  if (employmentStatus === 'ACTIVE' && leftOn !== null && leftOn < ctx.today) {
    b.warn('status', 'STATUS_DATE_MISMATCH', { status: employmentStatus, leftOn })
  }

  const department = b.optional('department')
  const position = b.optional('position')

  return b.finish(employeeSchema, {
    externalId,
    firstName,
    lastName,
    email,
    nationalId: nationalId(b),
    department: department && collapseWhitespace(department),
    position: position && collapseWhitespace(position),
    managerEmail,
    hiredOn,
    leftOn,
    status: employmentStatus,
    note: b.text('note'),
  })
}
