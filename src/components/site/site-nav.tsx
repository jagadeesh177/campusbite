'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Logo } from '@/components/ui/logo'
import { buttonClasses } from '@/components/ui/button'

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/#features', label: 'Features' },
  { href: '/#contact', label: 'Contact' },
]

export function SiteNav() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main">
        <Logo />
        <ul className="hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium text-ink/80 transition-colors hover:bg-primary-soft hover:text-primary">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="hidden md:block">
          <Link href="/login" className={buttonClasses('primary', 'sm', 'px-4')}>
            Login
          </Link>
        </div>
        <button
          className="flex h-10 w-10 items-center justify-center rounded-xl text-ink hover:bg-primary-soft md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </nav>
      {open && (
        <div id="mobile-nav" className="border-t border-line bg-surface px-4 pb-4 md:hidden">
          <ul className="py-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-3 text-[15px] font-medium text-ink hover:bg-primary-soft">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/login" onClick={() => setOpen(false)} className={buttonClasses('primary', 'lg', 'w-full')}>
            Login
          </Link>
        </div>
      )}
    </header>
  )
}
