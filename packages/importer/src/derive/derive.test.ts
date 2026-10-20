import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseFile, summarize } from '../batch'
import { EMPTY_REFERENCE, type ImportBatch } from '../types'
import { validateBatch } from '../validate'
import { toCsv } from './csv-out'
import { DERIVED_AS_OF, DERIVED_FILES, deriveImportFiles, type SourceFile } from './derive'

const DATA = path.join(import.meta.dirname, '../../../../data')
const IMPORT = path.join(DATA, 'import')

const sources: SourceFile[] = readdirSync(DATA)
  .filter(name => name.endsWith('.csv'))
  .sort()
  .map(name => ({ name, bytes: readFileSync(path.join(DATA, name)) }))
const derived = deriveImportFiles(sources)

/** The derived import files, read back as the wizard reads uploads. */
function importedBack(): ImportBatch {
  const batch: ImportBatch = {}
  for (const name of Object.values(DERIVED_FILES)) {
    const file = parseFile(name, readFileSync(path.join(IMPORT, name)), { today: DERIVED_AS_OF })
    expect(file.error).toBeNull()
    ;(batch as Record<string, unknown>)[file.kind ?? ''] = file.rows
  }
  return validateBatch(batch, EMPTY_REFERENCE)
}

/** Warnings the derived files may still raise: what is worth a look, and what will be new. */
const ALLOWED_WARNINGS = new Set([
  'NO_DEPARTMENT',
  'HIRED_IN_FUTURE',
  'COMPLETED_AFTER_LEAVING',
  'PLANNED_IN_PAST',
  'NON_WORKING_DAY',
  'OVERBOOKED',
  'ZERO_CAPACITY',
  'WILL_CREATE',
])

describe('the derived import files', () => {
  it('are what the script writes now: regenerate them with `pnpm data:derive`', () => {
    for (const [name, text] of Object.entries(derived.files))
      expect(readFileSync(path.join(IMPORT, name), 'utf8'), name).toBe(text)
  })

  it('import onto an empty register with no error, and nothing inferred again', () => {
    const batch = importedBack()
    const codes = new Set<string>()
    for (const rows of Object.values(batch)) {
      expect(summarize(rows).invalid).toBe(0)
      for (const row of rows) for (const w of row.warnings) codes.add(w.code)
    }
    expect([...codes].filter(c => !ALLOWED_WARNINGS.has(c))).toEqual([])
    expect(batch.courses).toHaveLength(10)
    expect(batch.employees).toHaveLength(170)
    expect(batch.rooms).toHaveLength(9)
    expect(batch.sessions).toHaveLength(32)
    expect(batch.completions).toHaveLength(2814)
  })

  it('account for every source row once: written, or left out and listed', () => {
    for (const [file, { rows, kept, leftOut }] of Object.entries(derived.accounted)) {
      expect(
        [...kept, ...leftOut].sort((a, b) => a - b),
        file
      ).toEqual(rows)
      const listed = derived.ambiguities
        .filter(a => a.file === file && a.decision === 'left out')
        .map(a => a.line)
      expect(
        listed.sort((a, b) => a - b),
        file
      ).toEqual(leftOut)
    }
  })

  it('leave out completions whose name belongs to another employee than their ID', () => {
    const other = derived.ambiguities.filter(a => a.issue === 'NAME_OF_ANOTHER_EMPLOYEE')
    expect(other.map(a => [a.line, a.id])).toEqual([
      [569, 'Z000561'],
      [600, 'Z000592'],
      [847, 'Z000838'],
      [1385, 'Z001371'],
      [1578, 'Z001564'],
    ])
    expect(other[0]?.detail).toBe('id=E0029 name=Malý Adam nameOf=E0054')
  })

  it('repair only the course typo they know, and leave a near code that is another course', () => {
    const typos = derived.inferences.filter(i => i.rule === 'COURSE_CODE_TYPO')
    expect(typos.map(i => [i.id, i.original, i.derived])).toEqual([
      ['Z002753', 'KYB3R', 'KYBER'],
      ['T010', 'KYB3R', 'KYBER'],
    ])
    const unknown = derived.ambiguities.filter(a => a.issue === 'COURSE_NOT_FOUND')
    expect(unknown.map(a => a.detail)).toEqual([
      'value=GDPR-2 suggestion=none',
      'value=BOZP-X suggestion=BOZP-Z',
      'value=BOZP-X suggestion=BOZP-Z',
      'value=BOZP-X suggestion=BOZP-Z',
      'value=BOZP-X suggestion=BOZP-Z',
    ])
  })

  it('give emails their domain, and expiries the course’s validity, saying so', () => {
    expect(
      derived.inferences.filter(i => i.rule === 'EMAIL_DOMAIN').map(i => [i.id, i.derived])
    ).toEqual([
      ['E0129', 'marek.havel@vzorova.example'],
      ['E0150', 'jiri.simek@vzorova.example'],
      ['E0157', 'dagmar.pospisilova@vzorova.example'],
    ])
    // GDPR is valid 3 years; the export said 5.
    expect(
      derived.inferences.find(i => i.rule === 'VALIDITY_FROM_COURSE' && i.id === 'Z000009')
    ).toMatchObject({ field: 'validUntil', original: '07.01.2024', derived: '2022-01-07' })
  })

  it('list the rooms the sessions name, with the kind and seats inferred', () => {
    expect(derived.files[DERIVED_FILES.rooms]?.split('\n').slice(0, 3)).toEqual([
      'nazev,typ,kapacita',
      'Aula A,učebna,40',
      'Aula B,učebna,20',
    ])
    expect(derived.inferences.filter(i => i.file === 'mistnosti.csv')).toHaveLength(18)
  })

  it('note the comments the exports carry, for a person to read', () => {
    expect(derived.ambiguities.filter(a => a.decision === 'noted')).toMatchObject([
      { file: 'absolvovana_skoleni.csv', line: 612, issue: 'COMMENT' },
    ])
  })

  it('match the counts their README gives', () => {
    const readme = readFileSync(path.join(IMPORT, 'README.md'), 'utf8')
    for (const [file, { kept, leftOut }] of Object.entries(derived.accounted))
      expect(readme, file).toContain(
        `| \`${file}\` | ${String(kept.length)} | ${String(leftOut.length)} |`
      )
  })
})

describe('toCsv', () => {
  it('quotes a cell only for a comma, a quote or a line break', () => {
    expect(
      toCsv(
        ['a', 'b'],
        [
          ['x,y', 'say "hi"'],
          ['two\nlines', null],
          [3, 'plain'],
        ]
      )
    ).toBe('a,b\n"x,y","say ""hi"""\n"two\nlines",\n3,plain\n')
  })
})

describe('deriveImportFiles', () => {
  const file = (name: string, lines: string[]) => ({
    name,
    bytes: new TextEncoder().encode(lines.join('\n')),
  })

  it('refuses a file it cannot recognise', () => {
    expect(() => deriveImportFiles([file('psi.csv', ['jmeno_psa', 'Rex'])])).toThrow('psi.csv')
  })

  it('writes who is on leave or has left as the exports say it', () => {
    const out = deriveImportFiles([
      file('zamestnanci.csv', [
        'id_zamestnance,jmeno,prijmeni,email,utvar,pozice,datum_nastupu,datum_ukonceni,stav',
        'E0001,Eva,Malá,,Vedení,Ředitelka,2015-01-01,,rodičovská',
        'E0002,Jan,Malý,,Vedení,Řidič,2015-01-01,2020-01-01,ukončen',
      ]),
    ])
    const lines = out.files[DERIVED_FILES.employees]?.split('\n') ?? []
    expect(lines[1]).toContain(',rodičovská,')
    expect(lines[2]).toContain(',ukončen,')
  })

  it('writes the catalogue’s requirement language back', () => {
    const out = deriveImportFiles([
      file('katalog.csv', [
        'kod,nazev,platnost_mesicu,povinne_pro',
        'LAB,Laboratoř,12,UTVAR:Laboratoře;Knihovna',
        'RID,Řidiči,12,POZICE:Řidič',
        'ANGL,Angličtina,,NEPOVINNE',
      ]),
    ])
    expect(out.files[DERIVED_FILES.courses]?.split('\n').slice(1, 4)).toEqual([
      'LAB,Laboratoř,12,UTVAR:Laboratoře;Knihovna',
      'RID,Řidiči,12,POZICE:Řidič',
      'ANGL,Angličtina,,NEPOVINNE',
    ])
  })
})
