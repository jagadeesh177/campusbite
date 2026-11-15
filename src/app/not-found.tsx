import { SearchX } from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Logo } from '@/components/ui/logo'

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo />
      <div className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-soft text-accent-ink">
        <SearchX className="h-8 w-8" />
      </div>
      <h1 className="mt-5 text-2xl font-bold">We couldn&apos;t find that page</h1>
      <p className="mt-2 max-w-sm text-muted">It may have moved, or you may not have access to it.</p>
      <ButtonLink href="/" className="mt-6">Back to home</ButtonLink>
    </div>
  )
}
