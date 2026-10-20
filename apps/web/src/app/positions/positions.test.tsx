// @vitest-environment jsdom
import {
  getDepartment,
  getGroupName,
  getPosition,
  listDepartmentSummaries,
  listPositionSummaries,
  listUpcomingBookings,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import {
  booking,
  counts,
  departmentDetail,
  departmentSummary,
  members,
  positionDetail,
  positionSummary,
} from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import PositionPage, { generateMetadata as positionMetadata } from './[id]/page'
import PositionsPage, { generateMetadata as positionsMetadata } from './page'

/**
 * The people list is full width: it sits outside the grid that holds the facts card and the
 * courses (the closest element containing both headings).
 */
function expectPeopleBelowTheSplit(facts: string) {
  const card = screen.getByRole('heading', { name: facts })
  const courses = screen.getByRole('heading', { name: 'Mandatory courses' })
  let split = card.parentElement
  while (split && !split.contains(courses)) split = split.parentElement
  const people = screen.getByRole('heading', { name: 'People' })
  expect(split?.contains(people)).toBe(false)
  expect(courses.compareDocumentPosition(people) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
}

/** The people list: the table after the "People" heading. */
function peopleTable(): HTMLElement {
  const tables = screen.getAllByRole('table')
  const people = screen.getByRole('heading', { name: 'People' })
  const table = tables.find(
    t => people.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING
  )
  if (!table) throw new Error('no people table')
  return table
}

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getDepartment: vi.fn(),
  getDepartmentForEdit: vi.fn(),
  getPositionForEdit: vi.fn(),
  listGroupOptions: vi.fn(),
  getPosition: vi.fn(),
  listDepartmentSummaries: vi.fn(),
  listGroupMembers: vi.fn(() => Promise.resolve(members())),
  listPositionSummaries: vi.fn(),
  getGroupName: vi.fn(),
  listUpcomingBookings: vi.fn(),
}))

vi.mock('@/server/auth')

vi.mock('@/server/actions/groups', () => ({
  saveDepartmentAction: vi.fn(),
  savePositionAction: vi.fn(),
}))

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

beforeEach(() => {
  signInAs('VIEWER')
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
      memberCount: 0,
    }),
  ])
  vi.mocked(getDepartment).mockResolvedValue(departmentDetail())
  vi.mocked(listPositionSummaries).mockResolvedValue([
    positionSummary(),
    positionSummary({ id: 'pos_none', name: 'Stážista', departments: [] }),
  ])
  vi.mocked(getPosition).mockResolvedValue(positionDetail())
  vi.mocked(getGroupName).mockImplementation(kind =>
    Promise.resolve(kind === 'department' ? 'Laboratoře' : 'Laborant')
  )
  vi.mocked(listUpcomingBookings).mockResolvedValue([
    booking(),
    booking({
      sessionExternalId: 'T020',
      courseCode: 'GDPR',
      courseName: 'Ochrana osobních údajů',
      startsAt: '2026-11-05T13:00:00.000Z',
      endsAt: '2026-11-05T16:00:00.000Z',
      person: { externalId: 'E0154', name: 'Adámek Petr' },
    }),
  ])
})

describe('positions', () => {
  it('list where each sits and how compliant it is', async () => {
    const user = userEvent.setup()
    expect(await positionsMetadata()).toEqual({ title: 'Positions' })
    await renderServer(PositionsPage({ searchParams: params({}) }))
    const lab = screen.getByRole('row', { name: /^Laborant/ })
    expect(within(lab).getByRole('link', { name: 'Laborant' }).getAttribute('href')).toBe(
      '/positions/pos_lab'
    )
    expect(within(lab).getByText('Laboratoře')).toBeTruthy()
    const intern = screen.getByRole('row', { name: /Stážista/ })
    expect(within(intern).getByText('—')).toBeTruthy()
    await user.click(within(lab).getByRole('button', { name: 'People with the position Laborant' }))
    const people = await screen.findByRole('table', { name: 'People of Laborant' })
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
    await renderServer(PositionsPage({ searchParams: params({}) }))
    expect(screen.getByText('No positions yet.')).toBeTruthy()
  })

  it('show one position: its departments, courses and people', async () => {
    const props = { params: params({ id: 'pos_lab' }), searchParams: params({}) }
    expect(await positionMetadata(props)).toEqual({ title: 'Laborant' })
    await renderServer(PositionPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Laborant' })).toBeTruthy()
    expect(
      screen.getByRole('link', { name: 'Open in the employee list' }).getAttribute('href')
    ).toBe('/employees?position=Laborant')
    expect(screen.getAllByRole('link', { name: 'Laboratoře' }).length).toBeGreaterThan(0)
    expectPeopleBelowTheSplit('Position')
    expect(within(peopleTable()).queryByRole('columnheader', { name: /Position/ })).toBeNull()
    expect(within(peopleTable()).getByRole('columnheader', { name: /Department/ })).toBeTruthy()
    await expectNoAxeViolations()
  })

  it('show a position nobody holds anywhere; and not one that does not exist', async () => {
    vi.mocked(getPosition).mockResolvedValue(positionDetail({ departments: [], courses: [] }))
    await renderServer(
      PositionPage({ params: params({ id: 'pos_lab' }), searchParams: params({}) })
    )
    expect(screen.getByText('Nobody with this position belongs to a department.')).toBeTruthy()
    expect(screen.getByText('Nothing is required of this position.')).toBeTruthy()
    vi.mocked(getPosition).mockResolvedValueOnce(null)
    await expect(
      renderServer(PositionPage({ params: params({ id: 'gone' }), searchParams: params({}) }))
    ).rejects.toThrow(NotFoundError)
  })
})
