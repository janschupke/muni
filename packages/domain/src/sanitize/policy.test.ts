import { describe, expect, it } from 'vitest'

import { loadPolicy, maskEmail, maskText, sanitizeRecord, SanitizePolicyError } from './policy'

const employee = {
  id: 'e1',
  firstName: 'Tereza',
  email: 'tereza.urbanova@vzorova.example',
  nationalId: '665917/0359',
  note: 'interní poznámka',
}

describe('default policy', () => {
  const policy = loadPolicy()

  it('removes the national ID and note for anonymous viewers entirely', () => {
    const out = sanitizeRecord(policy, 'employee', employee, 'anonymous')
    expect(out).not.toHaveProperty('nationalId')
    expect(out).not.toHaveProperty('note')
    expect(JSON.stringify(out)).not.toContain('0359')
    expect(out.email).toBe('t••••••••••••••@vzorova.example')
    expect(out.firstName).toBe('Tereza')
  })

  it('masks the national ID for signed-in viewers', () => {
    const out = sanitizeRecord(policy, 'employee', employee, 'authenticated')
    expect(out.nationalId).toBe('•••••••0359')
    expect(out.email).toBe(employee.email)
    expect(out.note).toBe(employee.note)
  })

  it('keeps null values null unless omitted', () => {
    const out = sanitizeRecord(policy, 'employee', { ...employee, email: null }, 'anonymous')
    expect(out.email).toBeNull()
  })
})

describe('loadPolicy overrides', () => {
  it('merges per field and per audience', () => {
    const policy = loadPolicy(JSON.stringify({ 'employee.email': { anonymous: { mode: 'omit' } } }))
    expect(policy['employee.email'].anonymous).toEqual({ mode: 'omit' })
    expect(policy['employee.email'].authenticated).toEqual({ mode: 'show' })
    expect(policy['employee.nationalId'].anonymous).toEqual({ mode: 'omit' })
  })

  it.each([
    ['not json', '{'],
    ['unknown field', JSON.stringify({ 'employee.salary': { anonymous: { mode: 'show' } } })],
    ['unknown mode', JSON.stringify({ 'employee.email': { anonymous: { mode: 'hash' } } })],
    ['masking a number', JSON.stringify({ 'completion.price': { anonymous: { mode: 'mask' } } })],
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
