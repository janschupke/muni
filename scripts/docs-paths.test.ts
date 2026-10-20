import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Every file the docs name exists: a path in backticks, or a relative link. A move or a
// rename that leaves a doc pointing nowhere fails here, not in a reader's hands.

const ROOT = path.join(import.meta.dirname, '..')

/** The docs: the README, the agent pointers, docs/ and the rules in .ai/. */
const DOCS = [
  'README.md',
  'CLAUDE.md',
  'AGENTS.md',
  'apps/web/AGENTS.md',
  ...['docs', '.ai'].flatMap(dir =>
    readdirSync(path.join(ROOT, dir), { recursive: true, encoding: 'utf8' })
      .filter(f => f.endsWith('.md'))
      .map(f => path.join(dir, f))
  ),
]

/** Where a path in backticks may start: the root, an app or package, or its `src/`. */
const BASES = [
  '',
  ...['apps', 'packages'].flatMap(top =>
    readdirSync(path.join(ROOT, top)).flatMap(name => [`${top}/${name}/`, `${top}/${name}/src/`])
  ),
]

/** Names in backticks that look like paths but are not files of the repo, and why. */
const NOT_FILES: Record<string, string> = {
  'e2e/.auth/': 'written by the e2e setup',
  'test-results/lighthouse': 'written by the Lighthouse run',
  'summary.json': 'written by the Lighthouse run',
  'apps/web/visual-shots': 'written by the visual run',
  'loading.tsx': 'the file the app has none of, on purpose',
  'mistnosti.csv': 'an optional export the user supplies',
  'origin/master': 'a git ref',
  'import-x/no-cycle': 'an ESLint rule',
}

const FILE = /\.(ts|tsx|js|mjs|json|css|md|ya?ml|prisma|sql|csv)$/
const PATH = /^[\w.[\]-]+(\/[\w.[\]-]+)*\/?$/

/** The repo's files, tracked or not, without what git ignores. */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)
const basenames = new Set(files.map(f => path.basename(f)))

/** The spans in backticks that name a file or a folder, outside code blocks. */
function namedPaths(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, '')
  return [...prose.matchAll(/`([^`\n]+)`/g)]
    .map(m => m[1] ?? '')
    .filter(span => PATH.test(span) && (span.includes('/') || FILE.test(span)))
}

/** Relative links (`[text](path)`), without their anchor. */
function linkedPaths(text: string): string[] {
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map(m => (m[1] ?? '').split('#')[0] ?? '')
    .filter(href => href !== '' && !/^[a-z]+:/.test(href))
}

const found = (span: string) =>
  span.includes('/')
    ? BASES.some(base => existsSync(path.join(ROOT, base, span)))
    : basenames.has(span)

describe('the paths the docs name', () => {
  it.each(DOCS)('%s names only files that exist', doc => {
    const text = readFileSync(path.join(ROOT, doc), 'utf8')
    const missing = namedPaths(text).filter(span => !(span in NOT_FILES) && !found(span))
    const broken = linkedPaths(text).filter(
      href => !existsSync(path.join(ROOT, path.dirname(doc), href))
    )
    expect({ missing, broken }).toEqual({ missing: [], broken: [] })
  })

  it('reads paths and links, and leaves code blocks, URLs and words alone', () => {
    const text = [
      'See `apps/web/src/proxy.ts`, `tokens.css`, `@muni/ui/select`, `/sessions`, `light-dark()`.',
      '```sh\npnpm `not/a/path.ts`\n```',
      '[docs](docs/ui.md#forms), [site](https://example.com), [here](#top).',
    ].join('\n')
    expect(namedPaths(text)).toEqual(['apps/web/src/proxy.ts', 'tokens.css'])
    expect(linkedPaths(text)).toEqual(['docs/ui.md'])
  })
})
