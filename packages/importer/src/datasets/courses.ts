import { courseSchema, type CourseInput, type RequirementInput } from '@muni/domain/schemas'
import { fold } from '@muni/utils/text'

import type { RowBuilder } from '../fields'
import type { RowMapResult } from '../types'

const YEARS_RE = /^(\d+)\s*(rok|roky|let|year|years)$/
const MONTHS_RE = /^(\d+)\s*(mesic|mesice|mesicu|month|months)$/

function validityMonths(b: RowBuilder): number | null {
  const raw = b.cell('validity')
  if (raw === '') return null
  const folded = fold(raw)
  if (/^\d+$/.test(folded)) {
    const months = Number(folded)
    if (months === 0) {
      b.warn('validity', 'VALIDITY_NONE', { raw })
      return null
    }
    return months
  }
  const years = YEARS_RE.exec(folded)
  if (years) {
    const months = Number(years[1]) * 12
    b.warn('validity', 'VALIDITY_NORMALIZED', { raw, value: months })
    return months
  }
  const months = MONTHS_RE.exec(folded)
  if (months) {
    b.warn('validity', 'VALIDITY_NORMALIZED', { raw, value: Number(months[1]) })
    return Number(months[1])
  }
  return b.error('validity', 'INVALID_VALIDITY', { raw })
}

/**
 * The catalog's requirement mini-language:
 * `VSICHNI` (everyone), `UTVAR:a;b;c` (departments), `POZICE:x` (positions), `NEPOVINNE` (optional).
 */
function requirements(b: RowBuilder): RequirementInput[] | null {
  const raw = b.cell('requiredFor')
  const folded = fold(raw)
  if (folded === '' || folded === 'nepovinne' || folded === 'optional') return []
  if (folded === 'vsichni' || folded === 'all') return [{ scope: 'ALL' }]

  const match = /^(utvar|pozice|department|position)\s*:\s*(.+)$/.exec(folded)
  if (!match) return b.error('requiredFor', 'INVALID_REQUIREMENT', { raw })
  // Keep the original spelling of the names (the folded copy loses diacritics).
  const names = raw
    .slice(raw.indexOf(':') + 1)
    .split(';')
    .map(n => n.trim())
    .filter(Boolean)
  if (names.length === 0) return b.error('requiredFor', 'INVALID_REQUIREMENT', { raw })
  const byDepartment = match[1] === 'utvar' || match[1] === 'department'
  return names.map(name =>
    byDepartment ? { scope: 'DEPARTMENT', department: name } : { scope: 'POSITION', position: name }
  )
}

export function mapCourse(b: RowBuilder): RowMapResult<CourseInput> {
  if (b.isSummaryRow('code')) return b.rejectSummary()
  const code = b.code('code')
  const name = b.required('name')
  const validity = validityMonths(b)
  const reqs = requirements(b)
  return b.finish(courseSchema, {
    code,
    name: name === null ? null : b.text('name'),
    validityMonths: validity,
    requirements: reqs,
  })
}
