import 'server-only'
import { headers } from 'next/headers'

export async function getClientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers()
    const fwd = h.get('x-forwarded-for')
    const ip = fwd?.split(',')[0]?.trim() || h.get('x-real-ip') || null
    return { ip, userAgent: h.get('user-agent')?.slice(0, 300) ?? null }
  } catch {
    // Outside a request (scripts/tests)
    return { ip: null, userAgent: null }
  }
}
