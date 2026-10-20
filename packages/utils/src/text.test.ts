import { describe, expect, it } from 'vitest'

import {
  cleanFreeText,
  compareCs,
  czechCollator,
  fold,
  isCompanyId,
  isFormulaLike,
  titleCase,
} from './text'

describe('fold', () => {
  it('folds the department variants in zamestnanci.csv to one key', () => {
    const variants = ['Správa budov', 'SPRÁVA BUDOV', 'Sprava budov', 'správa budov']
    expect(new Set(variants.map(fold))).toEqual(new Set(['sprava budov']))
    expect(fold('Laboratore')).toBe(fold('Laboratoře'))
  })
})

describe('titleCase', () => {
  it('fixes the shouting first name', () => {
    expect(titleCase('  LUCIE')).toBe('Lucie')
    expect(titleCase('řezníček')).toBe('Řezníček')
    expect(titleCase('jana-marie')).toBe('Jana-Marie')
  })
})

describe('formula neutralisation', () => {
  // Verbatim payloads from the poznamka column of zamestnanci.csv.
  it.each([
    ['=HYPERLINK("https://example.com/prihlaseni";"Klikněte pro ověření")', true],
    ['@SUM(1+1)', true],
    ['+1+1', true],
    ['-2+3', true],
    ['online verze', false],
  ])('%j formula-like: %s', (raw, expected) => {
    expect(isFormulaLike(raw)).toBe(expected)
  })

  it('keeps the text but drops the trigger', () => {
    expect(cleanFreeText('=HYPERLINK("x";"y")')).toBe('HYPERLINK("x";"y")')
    expect(cleanFreeText('  ')).toBeNull()
    expect(cleanFreeText(null)).toBeNull()
    expect(cleanFreeText(' řádek  1 \r\n\nřádek 2')).toBe('řádek 1\nřádek 2')
  })
})

describe('isCompanyId', () => {
  it('takes 8 digits whose last is the check digit', () => {
    // Masarykova univerzita, ČEZ; remainders 0 and 1 give check digits 1 and 0.
    for (const id of ['00216224', '45274649', '00000001', '00000060'])
      expect(isCompanyId(id)).toBe(true)
    for (const id of ['00216225', '0021622', '002162245', '0021622a', ''])
      expect(isCompanyId(id)).toBe(false)
  })
})

describe('Czech order', () => {
  it('sorts by the Czech alphabet, numbers by value, case and accents as a last resort', () => {
    const names = ['Učebna 10', 'Chemie', 'Učebna 2', 'Cvičiště', 'čítárna', 'Hala']
    expect(names.toSorted(czechCollator.compare)).toEqual([
      'Cvičiště',
      'čítárna',
      'Hala',
      'Chemie',
      'Učebna 2',
      'Učebna 10',
    ])
    expect(czechCollator.compare('Aula', 'aula')).toBe(0)
  })

  it('compareCs is localeCompare in Czech: case and accents break ties', () => {
    for (const [a, b] of [
      ['Aula', 'aula'],
      ['Černá', 'Cerna'],
      ['Chemie', 'Hala'],
    ] as const)
      expect(Math.sign(compareCs(a, b))).toBe(Math.sign(a.localeCompare(b, 'cs')))
  })
})
