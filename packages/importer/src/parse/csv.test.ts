import { describe, expect, it } from 'vitest'

import { detectDelimiter, parseCsv } from './csv'
import { decode } from './decode'

describe('decode', () => {
  it('strips a UTF-8 BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('kód')])
    expect(decode(bytes)).toEqual({ text: 'kód', encoding: 'utf-8' })
  })

  it('falls back to Windows-1250 for invalid UTF-8', () => {
    // "Vacková šk" as Excel writes it on a Czech Windows install (á = 0xE1, š = 0x9A).
    const bytes = new Uint8Array([0x56, 0x61, 0x63, 0x6b, 0x6f, 0x76, 0xe1, 0x20, 0x9a, 0x6b])
    expect(decode(bytes)).toEqual({ text: 'Vacková šk', encoding: 'windows-1250' })
  })
})

describe('detectDelimiter', () => {
  it('ignores delimiters inside quotes', () => {
    expect(detectDelimiter('a;b;"c,d,e,f"\n1;2;3')).toBe(';')
    expect(detectDelimiter('kod,nazev,platnost_mesicu,povinne_pro,poznamka')).toBe(',')
  })
})

describe('parseCsv', () => {
  it('keeps quoted delimiters, escaped quotes and line breaks in one record', () => {
    const text = 'id;note\r\nZ1;"Vedoucí potvrdil;\r\npředáno HR"\r\nZ2;"Poznámka: ""zrušeno"""\r\n'
    expect(parseCsv(text, ';')).toEqual([
      { line: 1, cells: ['id', 'note'] },
      { line: 2, cells: ['Z1', 'Vedoucí potvrdil;\npředáno HR'] },
      { line: 4, cells: ['Z2', 'Poznámka: "zrušeno"'] },
    ])
  })

  it('keeps a stray quote in an unquoted field literally', () => {
    expect(parseCsv('a,b"c,d', ',')).toEqual([{ line: 1, cells: ['a', 'b"c', 'd'] }])
  })

  it('reports blank lines as records so callers can count them', () => {
    expect(parseCsv('a\n\nb', ',').map(r => r.cells)).toEqual([['a'], [''], ['b']])
  })
})
