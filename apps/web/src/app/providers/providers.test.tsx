// @vitest-environment jsdom
import {
  getProvider,
  getProviderForEdit,
  listCourseOptions,
  listProviders,
} from '@muni/db/repositories'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { archiveAction, previewArchive } from '@/server/actions/archive'
import { requireAdminPage } from '@/server/auth'
import { signInAs } from '@/test/auth'
import { expectNoAxeViolations } from '@/test/axe'
import { providerDetail, providerRow } from '@/test/fixtures'
import { NotFoundError } from '@/test/next'
import { params, renderServer } from '@/test/render'

import EditProviderPage, { generateMetadata as editMetadata } from './[id]/edit/page'
import ProviderPage, { generateMetadata as providerMetadata } from './[id]/page'
import NewProviderPage, { generateMetadata as newMetadata } from './new/page'
import ProvidersPage, { generateMetadata as listMetadata } from './page'

vi.mock('@muni/db/repositories', async importOriginal => ({
  ...(await importOriginal<object>()),
  getProvider: vi.fn(),
  getProviderForEdit: vi.fn(),
  listCourseOptions: vi.fn(),
  listProviders: vi.fn(),
  recordExists: vi.fn(() => Promise.resolve(true)),
}))
vi.mock('@/server/auth')
vi.mock('@/server/actions/providers', () => ({ saveProvider: vi.fn() }))
vi.mock('@/server/actions/archive', () => ({
  archiveAction: vi.fn(() => Promise.resolve({ status: 'refused', reason: 'not_found' })),
  previewArchive: vi.fn(() => Promise.resolve({ ok: true, removesBookings: 0 })),
}))

const internal = providerRow({
  id: 'prov_int',
  name: 'Interní školitel',
  companyId: null,
  spend: null,
  lastCompletedOn: null,
  completions: 0,
  people: 0,
  courses: 0,
})

beforeEach(() => {
  signInAs('VIEWER')
  vi.mocked(listProviders).mockResolvedValue({ providers: [providerRow(), internal], prices: true })
  vi.mocked(getProvider).mockResolvedValue(providerDetail())
  vi.mocked(getProviderForEdit).mockResolvedValue({
    id: 'prov_vzor',
    name: 'Vzorový školicí ústav',
    companyId: '00216224',
    email: 'kurzy@vzor.example',
    phone: null,
    website: null,
    note: null,
    isDefault: false,
    offerings: [{ courseId: 'course_bozp', price: 450 }],
  })
  vi.mocked(listCourseOptions).mockResolvedValue(
    ['BOZP-Z', 'GDPR'].map(code => ({
      id: `course_${code.toLowerCase().replace('-z', '')}`,
      code,
      name: code === 'GDPR' ? 'Ochrana osobních údajů' : 'BOZP – základní školení',
      validityMonths: 24,
      needs: { sessionMinutes: 120, seats: 20, onlineAllowed: false, capabilities: [] },
      offerings: [],
    }))
  )
})

describe('provider list', () => {
  it('shows each provider with what was completed with it, and sorts', async () => {
    const user = userEvent.setup()
    expect(await listMetadata()).toEqual({ title: 'Providers' })
    await renderServer(ProvidersPage({ searchParams: params({}) }))
    const vzor = screen.getByRole('row', { name: /Vzorový/ })
    expect(
      within(vzor).getByRole('link', { name: 'Vzorový školicí ústav' }).getAttribute('href')
    ).toBe('/providers/prov_vzor')
    expect(
      within(vzor)
        .getAllByRole('cell')
        .map(c => c.textContent.replace(/\s/g, ' '))
    ).toEqual([
      'Vzorový školicí ústav',
      '00216224',
      '718',
      '161',
      '10',
      '390 840,00 Kč',
      '30.09.2026',
    ])
    expect(within(screen.getByRole('row', { name: /Interní/ })).getAllByText('—')).toHaveLength(3)
    expect(screen.queryByRole('link', { name: 'New provider' })).toBeNull()
    for (const header of [
      'Provider',
      'Company ID (IČO)',
      'Completions',
      'People',
      'Courses',
      'Spent',
    ])
      await user.click(screen.getByRole('button', { name: header }))
    await expectNoAxeViolations()
  })

  it('hides the spend from viewers who may not see prices; says when there are none', async () => {
    vi.mocked(listProviders).mockResolvedValueOnce({ providers: [providerRow()], prices: false })
    await renderServer(ProvidersPage({ searchParams: params({}) }))
    expect(screen.queryByRole('columnheader', { name: /Spent/ })).toBeNull()
    signInAs('ADMIN')
    vi.mocked(listProviders).mockResolvedValueOnce({ providers: [], prices: true })
    await renderServer(ProvidersPage({ searchParams: params({}) }))
    // The empty list offers the first one where the table would be, as the header does.
    const empty = screen.getByText(/No providers yet/).parentElement as HTMLElement
    expect(within(empty).getByRole('link', { name: 'New provider' }).getAttribute('href')).toBe(
      '/providers/new'
    )
  })
})

describe('provider detail', () => {
  const props = { params: params({ id: 'prov_vzor' }), searchParams: params({}) }

  it('shows its details, its totals, per course and its latest completions', async () => {
    expect(await providerMetadata(props)).toEqual({ title: 'Vzorový školicí ústav' })
    await renderServer(ProviderPage(props))
    expect(screen.getByRole('heading', { level: 1, name: 'Vzorový školicí ústav' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'kurzy@vzor.example' }).getAttribute('href')).toBe(
      'mailto:kurzy@vzor.example'
    )
    expect(screen.getByRole('link', { name: '+420 549 49 1111' }).getAttribute('href')).toBe(
      'tel:+420549491111'
    )
    expect(screen.getByRole('link', { name: 'www.vzor.example' }).getAttribute('href')).toBe(
      'https://www.vzor.example'
    )
    expect(screen.getByText('718 completions · 161 people · 10 courses')).toBeTruthy()
    expect(screen.getByText('390 840,00 Kč')).toBeTruthy()
    const lead = screen.getByRole('row', { name: /Vedení lidí\s*LEAD/ })
    expect(within(lead).getAllByText('—')).toHaveLength(2)
    const marie = screen.getByRole('row', { name: /Černá Marie/ })
    expect(within(marie).getByRole('link', { name: 'Černá Marie' }).getAttribute('href')).toBe(
      '/employees/E0153'
    )
    expect(within(marie).getByText('450,50 Kč')).toBeTruthy()
    expect(screen.getByText('Every completion with this provider, 2 in all.')).toBeTruthy()
    // Its sessions ahead in the sessions' own table, without a column that only repeats it.
    const upcoming = screen.getByRole('table', { name: 'Upcoming sessions' })
    expect(within(upcoming).getByRole('button', { name: 'Who is booked on T016' })).toBeTruthy()
    expect(within(upcoming).queryByRole('columnheader', { name: /Provider/ })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Edit' })).toBeNull()
    await expectNoAxeViolations()
  })

  it('without details, completions or prices, says so; and not one that does not exist', async () => {
    signInAs('ADMIN')
    vi.mocked(getProvider).mockResolvedValue(
      providerDetail({
        ...internal,
        email: null,
        phone: null,
        website: null,
        note: null,
        prices: false,
        byCourse: [],
        completionList: [],
      })
    )
    await renderServer(
      ProviderPage({ params: params({ id: 'prov_int' }), searchParams: params({}) })
    )
    expect(screen.getByText('No contact details yet.')).toBeTruthy()
    expect(screen.getByText('No completion names this provider yet.')).toBeTruthy()
    expect(screen.queryByText('Spent')).toBeNull()
    // The section stays, saying there is nothing in it yet.
    expect(screen.getByRole('heading', { level: 2, name: 'Completions' })).toBeTruthy()
    expect(
      screen.getByText('Completions recorded with this provider are listed here.')
    ).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Edit' }).getAttribute('href')).toBe(
      '/providers/prov_int/edit'
    )
    vi.mocked(getProvider).mockResolvedValueOnce(null)
    await expect(
      renderServer(ProviderPage({ params: params({ id: 'gone' }), searchParams: params({}) }))
    ).rejects.toThrow(NotFoundError)
  })
})

describe('provider forms', () => {
  it('add a provider, for admins only', async () => {
    expect(await newMetadata()).toEqual({ title: 'New provider' })
    await renderServer(NewProviderPage())
    expect(requireAdminPage).toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: /Name/ })).toHaveProperty('value', '')
    // Renaming is explained only where there is a name to change.
    expect(screen.queryByText(/Renaming changes the name/)).toBeNull()
    await expectNoAxeViolations()
  })

  it('edit a provider with its current values', async () => {
    signInAs('ADMIN')
    await renderServer(EditProviderPage({ params: params({ id: 'prov_vzor' }) }))
    // The tab says what the heading says.
    expect(await editMetadata({ params: params({ id: 'prov_vzor' }) })).toEqual({
      title: 'Edit Vzorový školicí ústav',
    })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Edit Vzorový školicí ústav' })
    ).toBeTruthy()
    expect(screen.getByRole('textbox', { name: /IČO/ })).toHaveProperty('value', '00216224')
    expect(screen.getByText(/Renaming changes the name/)).toBeTruthy()
    await expectNoAxeViolations()
    vi.mocked(getProviderForEdit).mockResolvedValueOnce(null)
    await expect(
      renderServer(EditProviderPage({ params: params({ id: 'gone' }) }))
    ).rejects.toThrow(NotFoundError)
  })
})

describe('archiving a provider', () => {
  it('archives from the provider page and says when it is gone already', async () => {
    const user = userEvent.setup()
    signInAs('ADMIN')
    await renderServer(
      ProviderPage({ params: params({ id: 'prov_vzor' }), searchParams: params({}) })
    )
    await user.click(screen.getByRole('button', { name: 'Archive' }))
    const confirm = await screen.findByRole('dialog', { name: 'Archive Vzorový školicí ústav?' })
    expect(previewArchive).toHaveBeenCalledWith('provider', 'prov_vzor')
    const archive = within(confirm).getByRole('button', { name: 'Archive' })
    await vi.waitFor(() => {
      expect(archive).toHaveProperty('disabled', false)
    })
    await user.click(archive)
    expect(archiveAction).toHaveBeenCalledWith(
      'provider',
      'prov_vzor',
      '/providers',
      expect.anything()
    )
    expect(
      await within(confirm).findByText('It no longer exists, or it is archived already.')
    ).toBeTruthy()
  })
})
