export interface DecodedText {
  text: string
  encoding: 'utf-8' | 'windows-1250'
}

const UTF8_BOM = [0xef, 0xbb, 0xbf]

/**
 * Decodes an uploaded file. Valid UTF-8 (with or without BOM) is taken as UTF-8;
 * anything else is read as Windows-1250, the Czech Excel default. Both decoders are
 * native to browsers and Node, so the same code runs in the wizard and in the seed.
 */
export function decode(bytes: Uint8Array): DecodedText {
  const hasBom = UTF8_BOM.every((b, i) => bytes[i] === b)
  const body = hasBom ? bytes.subarray(3) : bytes
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' }
  } catch {
    return { text: new TextDecoder('windows-1250').decode(body), encoding: 'windows-1250' }
  }
}
