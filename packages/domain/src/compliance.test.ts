import { describe, expect, it } from 'vitest'

import {
  bestCompletion,
  complianceRate,
  computeCompliance,
  countStatuses,
  statusOf,
  worstStatus,
  type ComplianceCompletion,
  type ComplianceEmployee,
  type ComplianceRequirement,
} from './compliance'

const options = { asOf: '2026-10-16', expiringWithinDays: 30 }

const lab: ComplianceEmployee = {
  id: 'e1',
  departmentId: 'lab',
  positionId: 'tech',
  status: 'ACTIVE',
}
const it_: ComplianceEmployee = {
  id: 'e2',
  departmentId: 'it',
  positionId: 'dev',
  status: 'ACTIVE',
}

const requirements: ComplianceRequirement[] = [
  { courseId: 'BOZP', scope: 'ALL', departmentId: null, positionId: null },
  { courseId: 'LAB', scope: 'DEPARTMENT', departmentId: 'lab', positionId: null },
  { courseId: 'LEAD', scope: 'POSITION', departmentId: null, positionId: 'boss' },
]

const done = (
  employeeId: string,
  courseId: string,
  completedOn: string,
  validUntil: string | null
): ComplianceCompletion => ({ employeeId, courseId, completedOn, validUntil })

describe('statusOf', () => {
  it.each([
    [null, 'MISSING'],
    [done('e', 'c', '2020-01-01', null), 'VALID'],
    [done('e', 'c', '2024-01-01', '2026-10-15'), 'EXPIRED'],
    [done('e', 'c', '2024-01-01', '2026-10-16'), 'EXPIRING'],
    [done('e', 'c', '2024-01-01', '2026-11-15'), 'EXPIRING'],
    [done('e', 'c', '2024-01-01', '2026-11-16'), 'VALID'],
  ] as const)('%j → %s', (completion, expected) => {
    expect(statusOf(completion, options)).toBe(expected)
  })
})

describe('bestCompletion', () => {
  it('prefers the longest validity and ignores future-dated records', () => {
    const best = bestCompletion(
      [
        done('e1', 'BOZP', '2022-01-01', '2024-01-01'),
        done('e1', 'BOZP', '2024-02-01', '2026-02-01'),
        done('e1', 'BOZP', '2027-01-01', '2029-01-01'),
      ],
      options.asOf
    )
    expect(best?.validUntil).toBe('2026-02-01')
  })

  it('lets a never-expiring completion win', () => {
    const best = bestCompletion(
      [done('e1', 'LEAD', '2020-01-01', null), done('e1', 'LEAD', '2025-01-01', '2030-01-01')],
      options.asOf
    )
    expect(best?.validUntil).toBeNull()
  })
})

describe('computeCompliance', () => {
  it('applies ALL, DEPARTMENT and POSITION rules', () => {
    const cells = computeCompliance(
      [lab, it_],
      requirements,
      [
        done('e1', 'BOZP', '2025-06-01', '2027-06-01'),
        done('e1', 'LAB', '2023-01-01', '2025-01-01'),
      ],
      options
    )
    expect(cells.map(c => [c.employeeId, c.courseId, c.status])).toEqual([
      ['e1', 'BOZP', 'VALID'],
      ['e1', 'LAB', 'EXPIRED'],
      ['e2', 'BOZP', 'MISSING'],
    ])

    const counts = countStatuses(cells)
    expect(counts).toEqual({ VALID: 1, EXPIRING: 0, EXPIRED: 1, MISSING: 1, total: 3 })
    expect(complianceRate(counts)).toBeCloseTo(1 / 3)
  })

  it('is fully compliant when nothing is required', () => {
    expect(complianceRate(countStatuses([]))).toBe(1)
  })
})

describe('worstStatus', () => {
  it('ranks MISSING highest', () => {
    expect(worstStatus(['VALID', 'EXPIRING', 'MISSING', 'EXPIRED'])).toBe('MISSING')
    expect(worstStatus([])).toBeNull()
  })
})
