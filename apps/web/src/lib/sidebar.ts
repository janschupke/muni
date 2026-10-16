/**
 * Remembers whether the sidebar is collapsed. Read by the server (so the first paint is right)
 * and written by the client; it lives outside the client component so the server gets the
 * string, not a client reference.
 */
export const SIDEBAR_COOKIE = 'muni.sidebar'
