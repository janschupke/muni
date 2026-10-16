export type Delimiter = ',' | ';' | '\t'

const CANDIDATES: Delimiter[] = [';', ',', '\t']

/** Picks the delimiter that splits the header line into the most fields (outside quotes). */
export function detectDelimiter(text: string): Delimiter {
  const firstLine = text.slice(0, text.search(/\r?\n|$/))
  let best: Delimiter = ','
  let bestCount = 0
  for (const candidate of CANDIDATES) {
    const count = countOutsideQuotes(firstLine, candidate)
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

function countOutsideQuotes(line: string, char: string): number {
  let count = 0
  let inQuotes = false
  for (const c of line) {
    if (c === '"') inQuotes = !inQuotes
    else if (c === char && !inQuotes) count += 1
  }
  return count
}

export interface CsvRecord {
  /** 1-based physical line the record starts on. */
  line: number
  cells: string[]
}

/**
 * RFC 4180 parser: quoted fields may contain delimiters, `""` escapes and line breaks.
 * Accepts LF and CRLF. A stray quote inside an unquoted field is kept literally.
 */
export function parseCsv(text: string, delimiter: Delimiter): CsvRecord[] {
  const records: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let fieldStart = true

  const endCell = () => {
    cells.push(cell)
    cell = ''
    fieldStart = true
  }
  const endRecord = () => {
    endCell()
    records.push({ line: recordLine, cells })
    cells = []
  }

  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        if (c === '\n') line++
        if (c !== '\r') cell += c
      }
      continue
    }
    if (c === '"' && fieldStart) {
      inQuotes = true
      fieldStart = false
    } else if (c === delimiter) {
      endCell()
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      cell += c
      fieldStart = false
    }
  }
  if (cell !== '' || cells.length > 0) endRecord()
  return records
}

export function isBlankRecord(record: CsvRecord): boolean {
  return record.cells.every(cell => cell.trim() === '')
}

/** Annotation lines some exports carry, e.g. `# export z 1. 10. 2026 – doplněno ručně`. */
export function isCommentRecord(record: CsvRecord): boolean {
  return (record.cells[0] ?? '').trimStart().startsWith('#')
}
