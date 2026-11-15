'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonSize, type ButtonVariant } from './button'
import { cn } from '@/lib/cn'

export function SubmitButton({
  children,
  pendingText,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
}: {
  children: ReactNode
  pendingText?: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  disabled?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled} aria-busy={pending}>
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  )
}

/**
 * Accessible confirmation dialog (native <dialog>). Renders a trigger button;
 * onConfirm receives the optional reason text.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  requireReason,
  reasonLabel = 'Reason',
  reasonPlaceholder,
  onConfirm,
  triggerVariant = 'secondary',
  triggerSize = 'md',
  triggerClassName,
  disabled,
}: {
  trigger: ReactNode
  title: string
  description?: ReactNode
  confirmLabel?: string
  confirmVariant?: ButtonVariant
  requireReason?: boolean
  reasonLabel?: string
  reasonPlaceholder?: string
  onConfirm: (reason: string) => Promise<void> | void
  triggerVariant?: ButtonVariant
  triggerSize?: ButtonSize
  triggerClassName?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <>
      <Button
        variant={triggerVariant}
        size={triggerSize}
        className={triggerClassName}
        disabled={disabled}
        onClick={() => {
          setReason('')
          ref.current?.showModal()
        }}
      >
        {trigger}
      </Button>
      <dialog
        ref={ref}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-line bg-surface p-0 text-ink shadow-lift"
        aria-labelledby="confirm-title"
      >
        <form
          method="dialog"
          className="p-6"
          onSubmit={async (e) => {
            e.preventDefault()
            if (requireReason && !reason.trim()) return
            setBusy(true)
            try {
              await onConfirm(reason.trim())
              ref.current?.close()
            } finally {
              setBusy(false)
            }
          }}
        >
          <h2 id="confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description && <div className="mt-2 text-sm text-muted">{description}</div>}
          {requireReason && (
            <div className="mt-4">
              <label htmlFor="confirm-reason" className="mb-1.5 block text-sm font-medium">
                {reasonLabel}
              </label>
              <textarea
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                required
                placeholder={reasonPlaceholder}
                className="block min-h-20 w-full rounded-xl border border-line px-3 py-2 text-[15px] focus:border-accent focus:shadow-[var(--shadow-focus)] focus:outline-none"
              />
            </div>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => ref.current?.close()} disabled={busy}>
              Go back
            </Button>
            <Button type="submit" variant={confirmVariant} disabled={busy || (requireReason && !reason.trim())}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  )
}

/** Small transient message shown after an action. */
export function useFlash(timeout = 3500) {
  const [flash, setFlash] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  useEffect(() => {
    if (!flash) return
    const t = setTimeout(() => setFlash(null), timeout)
    return () => clearTimeout(t)
  }, [flash, timeout])
  return [flash, setFlash] as const
}

export function Flash({ flash }: { flash: { tone: 'success' | 'danger'; text: string } | null }) {
  if (!flash) return null
  return (
    <div
      role="status"
      className={cn(
        'fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lift md:bottom-6',
        flash.tone === 'success' ? 'bg-primary text-white' : 'bg-danger text-white',
      )}
    >
      {flash.text}
    </div>
  )
}
