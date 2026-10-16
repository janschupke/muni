// @vitest-environment jsdom
import {
  getDepartment,
  getPosition,
  listDepartmentSummaries,
  listPositionSummaries,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { expectNoAxeViolations } from '@/test/axe'
import {
  counts,
  departmentDetail,
  departmentSummary,
  positionDetail,
  positionSummary,
} from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import PositionPage, { generateMetadata as positionMetadata } from '../positions/[id]/page'
import PositionsPage, { generateMetadata as positionsMetadata } from '../positions/page'
import DepartmentPage, { generateMetadata as departmentMetadata } from './[id]/page'
import DepartmentsPage, { generateMetadata as departmentsMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getDepartment: vi.fn(),
  getPosition: vi.fn(),
  listDepartmentSummaries: vi.fn(),
  listPositionSummaries: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(listDepartmentSummaries).mockResolvedValue([
    departmentSummary(),
    departmentSummary({
      id: 'dep_lib',
      name: 'Knihovna',
      active: 0,
      parentalLeave: 0,
      counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
      rate: 1,
      actionNow: 0,
      head: null,
      positions: [],
      members: [],
    }),
  ])
  vi.mocked(getDepartment).mockResolvedValue(departmentDetail())
  vi.mocked(listPositionSummaries).mockResolvedValue([
    positionSummary(),
    positionSummary({ id: 'pos_none', name: 'Stážista', departments: [] }),
  ])
  vi.mocked(getPosition).mockResolvedValue(positionDetail())
})

describe('departments', () => {
  it('list who leads each, how many people, how compliant, and open to its people', async () => {
    const user = userEvent.setup()
    expect(await departmentsMetadata()).toEqual({ title: 'Departments' })
    await renderServer(DepartmentsPage())
    const lab = screen.getByRole('row', { name: /^Laboratoře/ })
    expect(within(lab).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(lab).getByRole('link', { name: 'Urbanová Tereza' }).getAttribute('href')).toBe(
      '/employees/E0001'
    )
    expect(within(lab).getByText('+2 on leave')).toBeTruthy()
    expect(within(lab).getByText('89%')).toBeTruthy()
    expect(within(lab).getByText('9').className).toContain('danger')
    // Nobody works in the library: nothing to open.
    const library = screen.getByRole('row', { name: /Knihovna/ })
    expect(within(library).getAllByText('—')).toHaveLength(2)
    expect(within(library).queryByRole('button')).toBeNull()

    await user.click(within(lab).getByRole('button', { name: 'People in Laboratoře' }))
    const people = screen.getByRole('table', { name: 'People of Laboratoře' })
    const marie = within(people).getByRole('row', { name: /Černá Marie/ })
    expect(within(marie).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(marie).getByRole('link', { name: 'Laborantka' }).getAttribute('href')).toBe(
      '/positions/pos_lab'
    )
    expect(within(marie).getByText('2 / 3')).toBeTruthy()
    // What needs attention: the expired course, and the session she is booked on.
    expect(within(marie).getByText('Expired')).toBeTruthy()
    expect(
      within(marie).getByRole('link', { name: 'BOZP – základní školení' }).getAttribute('href')
    ).toBe('/courses/BOZP-Z')
    expect(
      within(marie)
        .getByRole('link', { name: /^booked for / })
        .getAttribute('href')
    ).toBe('/sessions/T016')
    const petr = within(people).getByRole('row', { name: /Adámek Petr/ })
    expect(within(petr).getByText('Parental leave')).toBeTruthy()
    expect(within(petr).getByText('All held')).toBeTruthy()
    expect(
      within(within(people).getByRole('row', { name: /Bílá Jana/ })).getByText('Nothing required')
    ).toBeTruthy()
    for (const header of ['Department', 'Head', 'People', 'Compliance', 'Need action now'])
      await user.click(screen.getByRole('button', { name: header }))
    await expectNoAxeViolations()
  })

  it('say when there are none', async () => {
    vi.mocked(listDepartmentSummaries).mockResolvedValue([])
    await renderServer(DepartmentsPage())
    expect(screen.getByText('No departments yet.')).toBeTruthy()
  })

  it('show one department: its head, positions, courses and people', async () => {
    const props = { params: params({ id: 'dep_lab' }) }
    expect(await departmentMetadata(props)).toEqual({ title: 'Laboratoře' })
    await renderServer(DepartmentPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Laboratoře' })).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Urbanová Tereza' })[0]?.getAttribute('href')).toBe(
      '/employees/E0001'
    )
    expect(screen.getByText('89% · 128 / 144')).toBeTruthy()
    const lab = screen.getByRole('row', { name: /Bezpečná práce/ })
    expect(within(lab).getByRole('link', { name: 'Laboratoře' }).getAttribute('href')).toBe(
      '/departments/dep_lab'
    )
    expect(within(lab).getByText('43%').className).toContain('bg-heat-poor')
    expect(within(lab).getByText('12 / 28')).toBeTruthy()
    // Its people: every member, not a first page of them.
    expect(screen.getByRole('link', { name: 'Adámek Petr' }).getAttribute('href')).toBe(
      '/employees/E0154'
    )
    expect(screen.getByRole('link', { name: 'Bílá Jana' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in the employee list' }).getAttribute('href')
    ).toBe('/employees?department=Laborato%C5%99e')
    await expectNoAxeViolations()
  })

  it('show a department with no head, positions or courses; and not one that does not exist', async () => {
    vi.mocked(getDepartment).mockResolvedValue(
      departmentDetail({
        head: null,
        positions: [],
        courses: [],
        counts: counts({ VALID: 0, EXPIRING: 0, EXPIRED: 0, MISSING: 0 }),
      })
    )
    await renderServer(DepartmentPage({ params: params({ id: 'dep_lab' }) }))
    expect(screen.getByText('Nobody has a position here.')).toBeTruthy()
    expect(screen.getByText('Nothing is required of this department.')).toBeTruthy()
    vi.mocked(getDepartment).mockResolvedValue(null)
    expect(await departmentMetadata({ params: params({ id: 'gone' }) })).toEqual({ title: 'gone' })
    await expect(DepartmentPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })
})

describe('positions', () => {
  it('list where each sits and how compliant it is', async () => {
    const user = userEvent.setup()
    expect(await positionsMetadata()).toEqual({ title: 'Positions' })
    await renderServer(PositionsPage())
    const lab = screen.getByRole('row', { name: /^Laborant/ })
    expect(within(lab).getByRole('link', { name: 'Laborant' }).getAttribute('href')).toBe(
      '/positions/pos_lab'
    )
    expect(within(lab).getByText('Laboratoře')).toBeTruthy()
    const intern = screen.getByRole('row', { name: /Stážista/ })
    expect(within(intern).getByText('—')).toBeTruthy()
    await user.click(within(lab).getByRole('button', { name: 'People with the position Laborant' }))
    const people = screen.getByRole('table', { name: 'People of Laborant' })
    expect(
      within(within(people).getByRole('row', { name: /Černá Marie/ }))
        .getByRole('link', { name: 'Laboratoře' })
        .getAttribute('href')
    ).toBe('/departments/dep_lab')
    // No department: a dash.
    expect(
      within(within(people).getByRole('row', { name: /Bílá Jana/ })).getAllByText('—')
    ).toHaveLength(2)
    vi.mocked(listPositionSummaries).mockResolvedValue([])
    await renderServer(PositionsPage())
    expect(screen.getByText('No positions yet.')).toBeTruthy()
  })

  it('show one position: its departments, courses and people', async () => {
    const props = { params: params({ id: 'pos_lab' }) }
    expect(await positionMetadata(props)).toEqual({ title: 'Laborant' })
    await renderServer(PositionPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Laborant' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in the employee list' }).getAttribute('href')
    ).toBe('/employees?position=Laborant')
    expect(screen.getAllByRole('link', { name: 'Laboratoře' }).length).toBeGreaterThan(0)
    await expectNoAxeViolations()
  })

  it('show a position nobody holds anywhere; and not one that does not exist', async () => {
    vi.mocked(getPosition).mockResolvedValue(positionDetail({ departments: [], courses: [] }))
    await renderServer(PositionPage({ params: params({ id: 'pos_lab' }) }))
    expect(screen.getByText('Nobody with this position belongs to a department.')).toBeTruthy()
    expect(screen.getByText('Nothing is required of this position.')).toBeTruthy()
    vi.mocked(getPosition).mockResolvedValue(null)
    expect(await positionMetadata({ params: params({ id: 'gone' }) })).toEqual({ title: 'gone' })
    await expect(PositionPage({ params: params({ id: 'gone' }) })).rejects.toThrow(NotFoundError)
  })
})
