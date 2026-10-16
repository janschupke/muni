import { describe, expect, it } from 'vitest'

import { cleanFreeText, fold, isFormulaLike, titleCase } from './text'

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
