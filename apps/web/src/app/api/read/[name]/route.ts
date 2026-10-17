import type { NextRequest } from 'next/server'

import { handleRead } from '@/server/reads/handle'

/** Every page's data, read in the browser through TanStack Query (`lib/query`). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  return handleRead((await params).name, request.nextUrl.searchParams)
}
