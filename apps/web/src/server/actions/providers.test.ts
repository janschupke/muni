import { createProvider, updateProvider } from '@muni/db/repositories'
import { describe, expect, it, vi } from 'vitest'

import { form, idle, redirectOf, serverSession, signedIn } from '@/test/server'

import { saveProvider } from './providers'

vi.mock('@clerk/nextjs/server', () => ({
  auth: Object.assign(vi.fn(), { protect: vi.fn() }),
  clerkClient: vi.fn(),
  clerkMiddleware: vi.fn((handler: unknown) => handler),
}))

vi.mock('@muni/db/repositories', async () =>
  (await import('@/test/repositories-mock')).repositoriesMock()
)

vi.mock('@muni/db/client', () => ({ getDb: () => 'db' }))

vi.mock('@muni/db/reference', () => ({ findArchivedKeys: vi.fn() }))

vi.mock('@muni/db/writer', async importOriginal => ({
  ...(await importOriginal<object>()),
  commitChunk: vi.fn(),
}))

serverSession()

describe('provider actions', () => {
  const providerForm = {
    name: 'Vzorový školicí ústav',
    companyId: '002 16 224',
    email: '',
    phone: '+420 549 49 1111',
    website: 'www.vzor.example',
    note: '',
  }

  it('save a provider with its details read and normalised, then show it', async () => {
    vi.mocked(createProvider).mockResolvedValueOnce({ ok: true, id: 'prov_new' })
    expect(await redirectOf(saveProvider(null, idle, form(providerForm)))).toBe(
      '/providers/prov_new'
    )
    expect(createProvider).toHaveBeenCalledWith({
      name: 'Vzorový školicí ústav',
      companyId: '00216224',
      email: null,
      phone: '+420 549 49 1111',
      website: 'https://www.vzor.example',
      note: null,
      isDefault: false,
      offerings: [],
    })
    vi.mocked(updateProvider).mockResolvedValueOnce({ ok: true, id: 'prov_1' })
    expect(await redirectOf(saveProvider('prov_1', idle, form(providerForm)))).toBe(
      '/providers/prov_1'
    )
  })

  it('name what is wrong: the IČO, the email, a taken name or IČO, a provider that is gone', async () => {
    expect(
      await saveProvider(null, idle, form({ ...providerForm, companyId: '00216225', email: 'x' }))
    ).toEqual({
      status: 'error',
      fieldErrors: { companyId: 'company_id', email: 'invalid_email' },
    })
    expect(createProvider).not.toHaveBeenCalled()
    vi.mocked(createProvider).mockResolvedValueOnce({ ok: false, taken: 'companyId' })
    expect(await saveProvider(null, idle, form(providerForm))).toEqual({
      status: 'error',
      fieldErrors: { companyId: 'taken' },
    })
    vi.mocked(updateProvider).mockRejectedValueOnce({ code: 'P2025' })
    expect(await saveProvider('gone', idle, form(providerForm))).toMatchObject({
      formError: 'not_found',
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(updateProvider).mockRejectedValueOnce(new Error('down'))
    expect(await saveProvider('prov_1', idle, form(providerForm))).toMatchObject({
      formError: 'generic',
    })
  })

  it('save providers for admins only', async () => {
    signedIn(null)
    expect(await saveProvider(null, idle, form(providerForm))).toMatchObject({
      formError: 'unauthorized',
    })
  })
})

describe('provider offerings', () => {
  it('read the courses it offers row by row, and say which one sessions still use', async () => {
    vi.mocked(updateProvider).mockResolvedValueOnce({ ok: true, id: 'prov_1' })
    const rows = {
      name: 'Externí lektor',
      'offerings.0.courseId': 'course_bozp',
      'offerings.0.price': '450',
      isDefault: 'on',
    }
    await redirectOf(saveProvider('prov_1', idle, form(rows)))
    expect(updateProvider).toHaveBeenLastCalledWith(
      'prov_1',
      expect.objectContaining({
        isDefault: true,
        offerings: [{ courseId: 'course_bozp', price: 450 }],
      })
    )
    vi.mocked(updateProvider).mockResolvedValueOnce({
      ok: false,
      offeringInUse: { course: 'GDPR', count: 2 },
    })
    expect(await saveProvider('prov_1', idle, form(rows))).toEqual({
      status: 'error',
      fieldErrors: { offerings: 'offering_in_use' },
      values: { offerings: { course: 'GDPR', count: 2 } },
    })
  })
})
