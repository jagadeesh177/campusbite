import {
  ArrowRight,
  Bell,
  Clock,
  CreditCard,
  GraduationCap,
  Mail,
  MapPin,
  PackageCheck,
  Phone,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  UtensilsCrossed,
  Zap,
} from 'lucide-react'
import { ButtonLink } from '@/components/ui/button'
import { Badge, VegMark } from '@/components/ui/badge'
import { FoodImage } from '@/components/ui/misc'
import { OrderProgress } from '@/components/ui/order-progress'
import { db } from '@/lib/db'
import { formatINR, rupeesToPaise } from '@/lib/money'

export const revalidate = 300

async function getFavourites() {
  try {
    return await db.foodItem.findMany({
      where: { isPopular: true, isAvailable: true },
      orderBy: { name: 'asc' },
      take: 4,
      select: { id: true, name: true, price: true, imageUrl: true, isVeg: true, prepTimeMinutes: true },
    })
  } catch {
    return []
  }
}

const STEPS = [
  { Icon: UtensilsCrossed, title: 'Browse the menu', text: 'See what the canteen is serving right now, with live availability.' },
  { Icon: ShoppingBag, title: 'Place your order', text: 'Add items to your cart and pick a pickup time that fits your break.' },
  { Icon: CreditCard, title: 'Pay securely', text: 'Pay online with UPI. Your order goes to the kitchen the moment payment is verified.' },
  { Icon: PackageCheck, title: 'Pick up your food', text: 'Get notified when it’s ready. Show your pickup code and you’re done.' },
]

const FEATURES = [
  { Icon: Zap, title: 'No waiting in queues', text: 'Order from class and walk straight to the pickup counter.' },
  { Icon: Smartphone, title: 'Online UPI payments', text: 'Pay with any UPI app. No cash, no change, no hassle.' },
  { Icon: Bell, title: 'Live order tracking', text: 'Watch your order move from accepted to ready in real time.' },
  { Icon: Clock, title: 'Easy pickup', text: 'Choose a pickup slot and collect with a one-time pickup code.' },
  { Icon: GraduationCap, title: 'College-exclusive access', text: 'Only verified, currently-enrolled students can order.' },
]

export default async function LandingPage() {
  const favourites = await getFavourites()

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_70%_20%,rgb(40_168_121/0.12),transparent_70%)]"
          aria-hidden
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-16 sm:px-6 md:pt-20 lg:grid-cols-[1.1fr_0.9fr] lg:pb-24">
          <div>
            <Badge tone="accent" dot className="mb-5">
              Now serving your campus canteen
            </Badge>
            <h1 className="text-4xl font-extrabold leading-[1.08] text-primary sm:text-5xl lg:text-[3.6rem]">
              Skip the Queue.
              <br />
              <span className="text-ink">Enjoy Your Break.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Order your favourite campus food from anywhere on campus. Pay online, track your order, and collect it
              when it&apos;s ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/login/student" size="xl" className="px-7">
                Order Food <ArrowRight className="h-5 w-5" />
              </ButtonLink>
              <ButtonLink href="#how-it-works" variant="secondary" size="xl" className="px-7">
                How It Works
              </ButtonLink>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> Verified students only</span>
              <span className="inline-flex items-center gap-2"><Smartphone className="h-4 w-4 text-accent" /> UPI payments</span>
              <span className="inline-flex items-center gap-2"><Bell className="h-4 w-4 text-accent" /> Live updates</span>
            </div>
          </div>

          {/* Product shot built from real UI components */}
          <div className="relative mx-auto w-full max-w-md sm:py-11">
            <div className="rounded-[1.75rem] border border-line bg-surface p-5 shadow-lift">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-subtle">Order CB-261115-7KQX</div>
                  <div className="mt-0.5 font-display text-lg font-bold text-ink">Being prepared</div>
                </div>
                <Badge tone="accent" dot>Live</Badge>
              </div>
              <div className="mt-5">
                <OrderProgress status="PREPARING" />
              </div>
              <div className="mt-5 space-y-3 rounded-2xl bg-bg p-3">
                {[
                  { name: 'Masala Dosa', img: '/food/masala-dosa.jpg', qty: 1, price: 4000 },
                  { name: 'Coffee', img: '/food/coffee.jpg', qty: 2, price: 4000 },
                ].map((i) => (
                  <div key={i.name} className="flex items-center gap-3">
                    <FoodImage src={i.img} alt="" className="h-11 w-11 shrink-0 rounded-xl" />
                    <div className="flex-1 text-sm font-medium">{i.name} <span className="text-muted">× {i.qty}</span></div>
                    <div className="text-sm font-semibold tabular-nums">{formatINR(i.price)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-white">
                <div>
                  <div className="text-xs text-white/70">Pickup code</div>
                  <div className="font-mono text-xl font-bold tracking-[0.3em]">K7QX4M</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/70">Ready by</div>
                  <div className="font-semibold">12:40 PM</div>
                </div>
              </div>
            </div>
            {/* Floating chips live in the reserved space above/below the card so they never cover content */}
            <div className="absolute top-0 left-6 hidden items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-success shadow-lift sm:inline-flex">
              <ShieldCheck className="h-4 w-4" /> UPI payment verified
            </div>
            <div className="absolute right-6 bottom-0 hidden items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm shadow-lift sm:inline-flex">
              <span className="text-subtle">Queue skipped</span>
              <span className="font-display font-bold text-primary">~15 min saved</span>
            </div>
          </div>
        </div>
      </section>

      {/* Favourites */}
      {favourites.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="text-xl font-bold text-ink">Campus favourites</h2>
            <span className="text-sm text-muted">Fresh from the canteen today</span>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {favourites.map((f) => (
              <div key={f.id} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-card">
                <FoodImage src={f.imageUrl} alt={f.name} className="aspect-[4/3]" />
                <div className="p-3.5">
                  <div className="flex items-center gap-2">
                    <VegMark isVeg={f.isVeg} />
                    <span className="truncate text-sm font-semibold">{f.name}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-sm">
                    <span className="font-semibold text-primary">{formatINR(rupeesToPaise(f.price))}</span>
                    <span className="text-muted">{f.prepTimeMinutes} min</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <Badge tone="primary">How it works</Badge>
            <h2 className="mt-4 text-3xl font-bold text-ink sm:text-4xl">From craving to collected in four steps</h2>
            <p className="mt-3 text-muted">No apps to install. Works on any phone or laptop browser.</p>
          </div>
          <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ Icon, title, text }, i) => (
              <li key={title} className="relative rounded-[var(--radius-card)] border border-line bg-bg p-6">
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <span className="font-display text-3xl font-extrabold text-line">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-ink">{title}</h3>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <Badge tone="accent">Features</Badge>
            <h2 className="mt-4 text-3xl font-bold text-ink sm:text-4xl">Built for the 15-minute break</h2>
            <p className="mt-3 text-muted">
              CampusBite takes the queue out of your lunch break — and gives the kitchen a calm, organised way to work
              through the rush.
            </p>
            <ButtonLink href="/login/student" size="lg" className="mt-8">
              Start ordering <ArrowRight className="h-4 w-4" />
            </ButtonLink>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ Icon, title, text }, i) => (
              <div
                key={title}
                className={`rounded-[var(--radius-card)] border border-line bg-surface p-6 shadow-card ${i === FEATURES.length - 1 ? 'sm:col-span-2' : ''}`}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                <p className="mt-1 text-[15px] text-muted">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="scroll-mt-20 px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] bg-primary text-white">
          <div className="grid gap-10 p-8 sm:p-12 md:grid-cols-[1.2fr_1fr]">
            <div>
              <h2 className="text-3xl font-bold">Questions? Talk to the canteen office.</h2>
              <p className="mt-3 max-w-md text-white/75">
                For order problems, refunds or account access, reach out and we&apos;ll help you quickly.
              </p>
              <ButtonLink href="/support" variant="secondary" size="lg" className="mt-7 border-transparent">
                Visit support
              </ButtonLink>
            </div>
            <ul className="space-y-4 text-[15px]">
              <li className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
                <a href="mailto:canteen@college.edu" className="hover:underline">canteen@college.edu</a>
              </li>
              <li className="flex items-start gap-3">
                <Phone className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
                <span>Canteen office · ask at the counter for the extension</span>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
                <span>Main Canteen, Ground floor, Student Centre</span>
              </li>
              <li className="flex items-start gap-3">
                <Clock className="mt-0.5 h-5 w-5 text-accent" aria-hidden />
                <span>Online orders 8:00 AM – 8:00 PM, Monday to Saturday</span>
              </li>
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
