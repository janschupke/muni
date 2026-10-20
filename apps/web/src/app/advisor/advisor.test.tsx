// @vitest-environment jsdom
import {
  getAdvisorInput,
  getSession,
  listCourseOptions,
  listRoomOptions,
  listSessions,
} from '@muni/db/repositories'
import { screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { signInAs } from '@/test/auth'
import { advisorInput, AULA_A, EXTERNAL, INTERNAL, ONLINE, session } from '@/test/fixtures'
import { params, renderServer } from '@/test/render'

import AdvisorPage, { generateMetadata as advisorMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  listRoomOptions: vi.fn(),
  listCourseOptions: vi.fn(),
  getAdvisorInput: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('@/server/auth')

vi.mock('@/server/actions/edit', () => ({ saveSession: vi.fn() }))

vi.mock('@/server/actions/archive', () => ({ archiveAction: vi.fn(), previewArchive: vi.fn() }))

vi.mock('@/server/actions/sessions', () => ({
  saveNewSession: vi.fn(),
  checkSessionSlotAction: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@/server/actions/assignments', () => ({
  addBookingAction: vi.fn(),
  applyAssignmentsAction: vi.fn(),
  moveSeatsAction: vi.fn(),
  removeAssignmentAction: vi.fn(() => Promise.resolve({ ok: true })),
}))

const online = session({
  externalId: 'T020',
  courseCode: 'GDPR',
  courseName: 'Ochrana osobních údajů',
  room: ONLINE,
  capacity: 100,
  unnamedBookings: 12,
  bookings: [],
  bookedCount: 12,
  pricePerPerson: null,
})

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listSessions).mockResolvedValue([
    session(),
    online,
    session({
      externalId: 'T030',
      bookedCount: 31,
      unnamedBookings: 31,
      bookings: [],
      capacity: 30,
    }),
  ])
  vi.mocked(getSession).mockResolvedValue(session())
  vi.mocked(getAdvisorInput).mockResolvedValue(advisorInput())
  vi.mocked(listRoomOptions).mockResolvedValue([
    { ...AULA_A, capacity: 40, capabilities: [] },
    { ...ONLINE, capacity: null, capabilities: [] },
  ])
  vi.mocked(listCourseOptions).mockResolvedValue([
    {
      id: 'course_bozp',
      code: 'BOZP-Z',
      name: 'BOZP – základní školení',
      validityMonths: 24,
      needs: { sessionMinutes: 180, seats: 30, onlineAllowed: true, capabilities: [] },
      offerings: [INTERNAL, EXTERNAL],
    },
  ])
})

describe('advisor page', () => {
  const search = (query: Record<string, string>) => ({ searchParams: params(query) })

  it('plans on the server and opens the view and bucket the URL names', async () => {
    expect(await advisorMetadata()).toEqual({ title: 'Advisor' })
    await renderServer(AdvisorPage(search({ view: 'action' })))
    expect(screen.getByRole('link', { name: /^Action required/, current: 'page' })).toBeTruthy()
    expect(screen.getByText('Only admins can book people.')).toBeTruthy()
  })

  it('falls back to the breakdown of what is non-compliant now on anything unknown', async () => {
    signInAs('ADMIN')
    await renderServer(AdvisorPage(search({ view: 'nonsense', bucket: '1999-01' })))
    expect(screen.getByRole('heading', { name: 'Non-compliant now: 2 trainings' })).toBeTruthy()
  })
})
