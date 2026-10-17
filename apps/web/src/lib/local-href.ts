/**
 * Whether `href` is a path in this app, and never another origin: it starts with one `/`,
 * and has no backslash (browsers read `/\evil.com` as `//evil.com`), no scheme and no control
 * characters. Every `then` a write goes on to passes this, wherever it came from.
 */
export function isLocalHref(href: string): boolean {
  return (
    href.startsWith('/') &&
    !href.startsWith('//') &&
    !href.includes('\\') &&
    // eslint-disable-next-line no-control-regex -- control characters are what it refuses
    !/[\u0000-\u001f\u007f]/.test(href)
  )
}
