'use client'

import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-danger-soft text-danger-ink">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">Something went wrong</h1>
      <p className="mt-2 max-w-sm text-muted">Please try again. If it keeps happening, contact the canteen office.</p>
      <Button onClick={reset} className="mt-6">Try again</Button>
    </div>
  )
}
