import { requireActor } from '@/lib/auth/guards'
import { AppError } from '@/lib/errors'
import { audit } from '@/lib/audit'
import { exportOrdersCsv, exportPaymentsCsv } from '@/lib/reports'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const actor = await requireActor('STAFF', 'REPORTS')
    const url = new URL(req.url)
    const type = url.searchParams.get('type') === 'payments' ? 'payments' : 'orders'
    const days = Math.min(400, Math.max(1, Number(url.searchParams.get('days')) || 30))
    const since = new Date(Date.now() - days * 86_400_000)
    const csv = type === 'payments' ? await exportPaymentsCsv(since) : await exportOrdersCsv(since)
    await audit({ actor, action: 'report.exported', entityType: 'Report', metadata: { type, days } })
    const stamp = new Date().toISOString().slice(0, 10)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="campusbite-${type}-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const status = e instanceof AppError ? (e.code === 'UNAUTHORIZED' ? 401 : 403) : 500
    return new Response(e instanceof AppError ? e.message : 'Export failed', { status })
  }
}
