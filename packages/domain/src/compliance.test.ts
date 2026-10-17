import { describe, expect, it } from 'vitest'

import {
  bestCompletion,
  complianceBand,
  type ComplianceCompletion,
  type ComplianceEmployee,
  complianceOf,
  compliancePercent,
  complianceRate,
  type ComplianceRequirement,
  computeCompliance,
  countStatuses,
  statusOf,
  worstStatus,
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

  it('between two never-expiring completions, keeps the later one', () => {
    const older = done('e1', 'LEAD', '2020-01-01', null)
    const newer = done('e1', 'LEAD', '2023-05-01', null)
    expect(bestCompletion([older, newer], options.asOf)).toBe(newer)
    expect(bestCompletion([newer, older], options.asOf)).toBe(newer)
    // A dated completion never replaces a never-expiring one.
    expect(
      bestCompletion([older, done('e1', 'LEAD', '2025-01-01', '2030-01-01')], options.asOf)
    ).toBe(older)
  })
})

describe('computeCompliance', () => {
  it('applies ALL, DEPARTMENT and POSITION rules', () => {
    const cells = computeCompliance(
      [lab, it_],
      requirements,
      [
        // Two records for one pair: the newer, longer-valid one decides.
        done('e1', 'BOZP', '2023-06-01', '2025-06-01'),
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

  it('counts what is held (valid or expiring) of what is required, with the share', () => {
    expect(complianceOf({ VALID: 3, EXPIRING: 1, EXPIRED: 2, MISSING: 2, total: 8 })).toEqual({
      held: 4,
      total: 8,
      rate: 0.5,
    })
    expect(complianceOf(countStatuses([]))).toEqual({ held: 0, total: 0, rate: 1 })
  })
})

describe('worstStatus', () => {
  it('ranks MISSING highest', () => {
    expect(worstStatus(['VALID', 'EXPIRING', 'MISSING', 'EXPIRED'])).toBe('MISSING')
    expect(worstStatus([])).toBeNull()
  })
})

describe('complianceBand', () => {
  it.each([
    [1, 'FULL'],
    [0.99, 'HIGH'],
    [0.9, 'HIGH'],
    [0.89, 'FAIR'],
    [0.75, 'FAIR'],
    [0.74, 'LOW'],
    [0.5, 'LOW'],
    [0.49, 'POOR'],
    [0, 'POOR'],
    [Number.NaN, 'POOR'],
  ])('%f is %s', (rate, band) => {
    expect(complianceBand(rate)).toBe(band)
  })

  it('agrees with the percent printed for it, for every count up to 300', () => {
    for (let total = 1; total <= 300; total++) {
      for (let held = 0; held <= total; held++) {
        const rate = held / total
        const shown = compliancePercent(rate)
        // The colour is the printed value's: two cells that read the same are the same colour.
        expect(complianceBand(shown / 100), `${held}/${total}`).toBe(complianceBand(rate))
        // 100 % only when everyone holds it.
        expect(shown === 100, `${held}/${total}`).toBe(held === total)
      }
    }
  })

  it('prints whole percents, rounded down', () => {
    expect(compliancePercent(0.896)).toBe(89)
    expect(compliancePercent(0.29)).toBe(29)
    expect(compliancePercent(0.999)).toBe(99)
    expect(compliancePercent(1)).toBe(100)
    expect(compliancePercent(0)).toBe(0)
  })
})
