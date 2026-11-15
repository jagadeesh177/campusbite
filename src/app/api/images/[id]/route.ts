import { db } from '@/lib/db'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response('Not found', { status: 404 })
  const img = await db.foodImage.findUnique({ where: { id } })
  if (!img) return new Response('Not found', { status: 404 })
  return new Response(new Uint8Array(img.data), {
    headers: {
      'Content-Type': img.mimeType,
      'Content-Length': String(img.size),
      // Images are immutable (a new upload gets a new id)
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
