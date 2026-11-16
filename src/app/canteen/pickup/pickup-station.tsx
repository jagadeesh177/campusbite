'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, CheckCircle2, Loader2, QrCode, ScanLine, ShieldAlert } from 'lucide-react'
import { completePickupAction, lookupPickupAction } from '@/app/actions/canteen'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { OrderStatusBadge } from '@/components/ui/badge'
import { Notice } from '@/components/ui/misc'
import { formatINR } from '@/lib/money'
import type { PickupPreview } from '@/lib/orders/pickup'

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

export function PickupStation() {
  const [input, setInput] = useState('')
  const [preview, setPreview] = useState<PickupPreview | null>(null)
  const [raw, setRaw] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanSupported, setScanSupported] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    setScanSupported('BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia)
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setScanning(false)
  }, [])

  useEffect(() => stopCamera, [stopCamera])

  const lookup = useCallback(
    async (value: string) => {
      if (!value.trim()) return
      setBusy(true)
      setError(null)
      setDone(null)
      setPreview(null)
      const r = await lookupPickupAction(value)
      setBusy(false)
      if (!r.ok) return setError(r.error)
      setRaw(value)
      setPreview(r.data)
    },
    [],
  )

  async function startCamera() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      streamRef.current = stream
      setScanning(true)
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      const Ctor = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector
      const detector = new Ctor({ formats: ['qr_code'] })
      const tick = async () => {
        if (!streamRef.current) return
        try {
          const codes = await detector.detect(video)
          if (codes[0]?.rawValue) {
            stopCamera()
            await lookup(codes[0].rawValue)
            return
          }
        } catch {
          /* frame not ready */
        }
        setTimeout(tick, 300)
      }
      tick()
    } catch {
      stopCamera()
      setError('Camera unavailable. Allow camera access or type the code instead.')
    }
  }

  async function handOver() {
    setBusy(true)
    setError(null)
    const r = await completePickupAction(raw)
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      await lookup(raw) // refresh preview state
      return
    }
    setDone(r.data.orderNumber)
    setPreview(null)
    setInput('')
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <Card>
        <CardBody>
          <h2 className="flex items-center gap-2 font-semibold"><ScanLine className="h-5 w-5 text-accent" /> Scan or enter code</h2>
          {scanSupported && (
            <div className="mt-4">
              <div className={scanning ? 'overflow-hidden rounded-2xl bg-ink' : 'hidden'}>
                <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline />
              </div>
              {scanning ? (
                <Button variant="secondary" size="lg" className="mt-3 w-full" onClick={stopCamera}>
                  <CameraOff className="h-5 w-5" /> Stop camera
                </Button>
              ) : (
                <Button size="xl" className="w-full" onClick={startCamera}>
                  <Camera className="h-5 w-5" /> Scan user&apos;s QR code
                </Button>
              )}
              <div className="my-5 flex items-center gap-3 text-xs font-medium text-subtle">
                <span className="h-px flex-1 bg-line" /> or type the pickup code <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          )}
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void lookup(input)
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="e.g. K7QX4M"
              maxLength={40}
              autoCapitalize="characters"
              autoComplete="off"
              aria-label="Pickup code"
              className="h-14 min-w-0 flex-1 rounded-xl border border-line px-4 text-center font-mono text-xl font-bold tracking-[0.3em] uppercase focus:border-accent focus:shadow-[var(--shadow-focus)] focus:outline-none"
            />
            <Button type="submit" size="xl" disabled={busy || input.trim().length < 6}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Check'}
            </Button>
          </form>
        </CardBody>
      </Card>

      <div className="space-y-4" aria-live="polite">
        {error && <Notice tone="danger">{error}</Notice>}
        {done && (
          <Card className="border-success/40">
            <CardBody className="flex flex-col items-center py-10 text-center">
              <CheckCircle2 className="h-14 w-14 text-success" />
              <div className="mt-3 font-display text-2xl font-bold">Handed over</div>
              <div className="mt-1 text-muted">{done} is marked collected.</div>
            </CardBody>
          </Card>
        )}
        {preview && (
          <Card className={preview.canCollect ? 'border-success/40 ring-4 ring-success/10' : 'border-danger/40'}>
            <CardBody>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-bold text-subtle">{preview.orderNumber}</div>
                  <div className="mt-1 text-2xl font-bold">{preview.userName}</div>
                  <div className="text-sm text-muted">{preview.studentId ?? 'No student ID'}</div>
                </div>
                <OrderStatusBadge status={preview.status} />
              </div>
              <ul className="mt-4 space-y-1.5 rounded-xl bg-bg p-4 text-[17px]">
                {preview.items.map((i, idx) => (
                  <li key={idx} className="flex justify-between">
                    <span className="font-medium">{i.name}</span>
                    <span className="font-bold text-primary">×{i.quantity}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-right text-sm text-muted">Paid {formatINR(preview.totalPaise)}</div>
              {preview.canCollect ? (
                <Button size="xl" className="mt-5 w-full" onClick={handOver} disabled={busy}>
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5 text-accent" />} Hand over & mark collected
                </Button>
              ) : (
                <div className="mt-5 flex items-center gap-2 rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger-ink">
                  <ShieldAlert className="h-5 w-5" /> {preview.problem}
                </div>
              )}
            </CardBody>
          </Card>
        )}
        {!preview && !done && !error && (
          <Card>
            <CardBody className="flex flex-col items-center py-12 text-center text-muted">
              <QrCode className="h-12 w-12 text-accent" />
              <p className="mt-3 max-w-xs">Order details will appear here so you can check the name before handing food over.</p>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  )
}
