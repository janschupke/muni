import { describe, expect, it } from 'vitest'

import {
  isVisible,
  loadPolicy,
  maskEmail,
  maskText,
  SanitizePolicyError,
  sanitizeRecord,
} from './policy'

const employee = {
  id: 'e1',
  firstName: 'Tereza',
  email: 'tereza.urbanova@vzorova.example',
  nationalId: '665917/0359',
  note: 'interní poznámka',
}

describe('default policy', () => {
  const policy = loadPolicy()

  it('removes the national ID and note for viewers entirely, and masks the email', () => {
    const out = sanitizeRecord(policy, 'employee', employee, 'VIEWER')
    expect(out).not.toHaveProperty('nationalId')
    expect(out).not.toHaveProperty('note')
    expect(JSON.stringify(out)).not.toContain('0359')
    expect(out.email).toBe('t••••••••••••••@vzorova.example')
    expect(out.firstName).toBe('Tereza')
  })

  it.each(['FULL', 'ADMIN'] as const)('shows %s the whole record', role => {
    expect(sanitizeRecord(policy, 'employee', employee, role)).toEqual(employee)
  })

  it('tells which fields a role sees at all', () => {
    expect(isVisible(policy, 'employee.note', 'VIEWER')).toBe(false)
    expect(isVisible(policy, 'employee.email', 'VIEWER')).toBe(true)
    expect(isVisible(policy, 'employee.note', 'FULL')).toBe(true)
  })

  it('keeps null values null unless omitted', () => {
    const out = sanitizeRecord(policy, 'employee', { ...employee, email: null }, 'VIEWER')
    expect(out.email).toBeNull()
    // An omitted field is omitted even when empty: its absence must not depend on the value.
    const viewer = sanitizeRecord(policy, 'employee', { ...employee, nationalId: null }, 'VIEWER')
    expect(viewer).not.toHaveProperty('nationalId')
  })
})

describe('loadPolicy overrides', () => {
  it('merges per field and per role', () => {
    const policy = loadPolicy(JSON.stringify({ 'employee.email': { VIEWER: { mode: 'omit' } } }))
    expect(policy['employee.email'].VIEWER).toEqual({ mode: 'omit' })
    expect(policy['employee.email'].FULL).toEqual({ mode: 'show' })
    expect(policy['employee.email'].ADMIN).toEqual({ mode: 'show' })
    expect(policy['employee.nationalId'].VIEWER).toEqual({ mode: 'omit' })
  })

  it.each([
    ['not json', '{'],
    ['unknown field', JSON.stringify({ 'employee.salary': { VIEWER: { mode: 'show' } } })],
    ['unknown mode', JSON.stringify({ 'employee.email': { VIEWER: { mode: 'hash' } } })],
    ['masking a number', JSON.stringify({ 'completion.price': { FULL: { mode: 'mask' } } })],
    // The audiences before roles existed: an old override must fail, not silently not apply.
    ['an old audience key', JSON.stringify({ 'employee.email': { anonymous: { mode: 'omit' } } })],
    // Admins edit these fields: hiding them from admins cannot hold, so it is refused.
    ['restricting admins', JSON.stringify({ 'employee.nationalId': { ADMIN: { mode: 'omit' } } })],
  ])('rejects %s', (_, json) => {
    expect(() => loadPolicy(json)).toThrow(SanitizePolicyError)
  })

  it('treats an empty env var as no override', () => {
    expect(loadPolicy('  ')).toEqual(loadPolicy())
  })
})

describe('masking', () => {
  it('handles short values and multi-byte characters', () => {
    expect(maskText('ab', 1, 1)).toBe('••')
    expect(maskText('Šťastný', 1)).toBe('Š••••••')
    expect(maskEmail('no-at-sign')).toBe('••••••••••')
  })
})
