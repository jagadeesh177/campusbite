# CampusBite

College canteen pre-ordering platform. Students order from anywhere on campus, pay online (UPI via Razorpay), track their order live and collect it with a one-time pickup code. The canteen works from a simple tablet board; college staff get reports, payments, refunds, accounts and an audit log.

**Status:** pilot-ready architecture with real ordering, payment verification, refunds, pickup verification and realtime updates. Some external services still need credentials or college authorisation — see [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript (strict) |
| Styling | Tailwind CSS 4, design tokens in `src/app/globals.css` |
| Database | PostgreSQL + Prisma 6 |
| Auth | Database sessions (HTTP-only cookie, SHA-256-hashed token), bcrypt passwords |
| Validation | Zod (every server action and API route) |
| Payments | Razorpay (UPI) + clearly-marked development simulator |
| Realtime | Server-Sent Events backed by an event table, polling fallback |
| Icons / QR | lucide-react, `qrcode` |
| Tests | Vitest (unit + integration against a real Postgres test DB) |

### Why not Socket.IO / Auth.js?

- **Realtime:** Vercel runs serverless functions; Socket.IO needs a long-lived server. CampusBite writes a `RealtimeEvent` row in the *same transaction* as each change, and `/api/events` streams rows the signed-in user is allowed to see. Clients reconnect automatically and fall back to 5-second polling. No extra service or credentials needed. If you later want push at large scale, swap the transport (Pusher/Ably) behind `src/lib/realtime/` without touching business logic.
- **Auth:** the app needs three role-locked portals, per-role session lifetimes, college-verified student activation and admin-created staff accounts with forced password change. A small, fully server-side session layer (`src/lib/auth/`) keeps every role decision on the server and is easy to audit.

---

## Project structure

```
prisma/
  schema.prisma          relational model (User, StudentProfile, Order, Payment, Refund, PickupToken, AuditLog, …)
  migrations/            SQL migrations
  seed.ts, seed-data.ts  demo data (development only)
src/
  app/
    (site)/              public website: landing, about, support, privacy, terms
    login/, activate/    three login portals + student activation
    student/             student portal
    canteen/             canteen portal (orders board, pickup, menu, settings)
    staff/               staff/admin portal (dashboard, students, canteen, food, payments, reports, team, audit)
    actions/             server actions (thin wrappers: authenticate → call service)
    api/                 events (SSE), Razorpay verify/webhook, images, CSV export, cron
  lib/
    auth/                sessions, passwords, guards, permissions, rate limiting, login, activation
    college/             CollegeIntegrationProvider + mock and API-template adapters
    orders/              state machine, pricing, order creation, transitions, pickup, expiry
    payments/            gateways, signature verification, confirmation, refunds, simulator, webhooks
    realtime/            event publishing
    reports.ts, admin.ts, menu.ts, kitchen.ts, audit.ts
  components/            design system (ui/), portal shell, feature components
tests/                   unit + integration tests
```

Business logic lives in `src/lib/**` as plain functions that take an explicit `Actor`. Server actions and routes only authenticate and delegate — that's what makes the logic testable and keeps permission checks in one place.

---

## Local setup

### 1. Prerequisites

- Node.js 20+ (developed on 24)
- PostgreSQL 15+ (developed on 18)

### 2. Install

```bash
npm install
cp .env.example .env
```

Edit `.env`: set `DATABASE_URL` and `DIRECT_URL` to your database, and generate random values for `PAYMENT_SIMULATOR_SECRET` and `CRON_SECRET`, for example:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> **This repo's development machine** uses a private Postgres cluster in `.pgdata/` on port 5433 (git-ignored). Start it with:
> ```bash
> pg_ctl -D .pgdata -o "-p 5433 -c listen_addresses=localhost" -l .pgdata-server.log start
> ```
> Keep the log file **outside** `.pgdata/` on Windows, or crash recovery can stall on a file lock.

### 3. Database

```bash
npx prisma migrate dev     # create tables
npm run db:seed            # demo menu, accounts and 3 weeks of orders (refuses to run in production)
```

### 4. Run

```bash
npm run dev                # http://localhost:3000
```

Production-mode locally:

```bash
npm run build
npm start
```

---

## Demo accounts (development only)

Created by the seed. **Never shown on login pages.** Delete or change them before any real use.

| Portal | Email | Password | Notes |
|---|---|---|---|
| Student | `aarav.sharma@college.edu` | `Student@123` | 10 seeded students (see `src/lib/college/mock-provider.ts`), all share this password |
| Staff (admin) | `admin@college.edu` | `Staff@123` | every staff permission. **Local seed only** — the live demo's admin password has been changed and is not published |
| Staff (accounts) | `finance@college.edu` | `Staff@123` | students, payments, reports, audit only |
| Canteen (manager) | `kitchen@college.edu` | `Canteen@123` | orders, menu, settings |
| Canteen (counter) | `counter@college.edu` | `Canteen@123` | orders only |

**Try student activation:** go to `/activate` with `neha.rao@college.edu` or `karan.mehta@college.edu` (enrolled in the mock directory but not yet activated). The code appears in the dev mailbox at `/dev/mailbox`. `old.graduate@college.edu` is refused (not enrolled); Gmail addresses are refused.

**Testing two roles at once in one browser:** cookies are per host, so use `http://localhost:3000` for one role and `http://127.0.0.1:3000` (or `127.0.0.2`) for another.

---

## Tests

```bash
npm test
```

54 tests. Integration tests run against `<your database>_test` (created/migrated automatically with `prisma migrate deploy`; tables are truncated per test — the runner refuses any database not ending in `_test`). Covered:

- Authentication, portal/role locking, deactivated accounts, enrollment re-checks, rate limiting (incl. atomicity under concurrency)
- Student eligibility & activation (college domain only, no enumeration, hashed codes, attempt lockout, weak passwords)
- Menu availability, cart calculations, server-side pricing (client prices ignored)
- Order creation idempotency under 6 simultaneous submissions; 8 students ordering at once; kitchen capacity
- Payment verification, amount/currency mismatch (fake confirmation), cross-student payment attempts, failed-then-retried payments
- Webhook signature verification and duplicate-delivery idempotency
- Status transitions: skipped steps, wrong roles, missing permissions, concurrent updates
- Refunds: rejection auto-refund, late payment after expiry, single gateway call under concurrent clicks
- Pickup: single use, concurrent scans, not-ready orders, mismatched QR, wrong roles

---

## Deployment (Vercel + managed PostgreSQL)

1. **Database:** create a managed Postgres with point-in-time recovery (Neon, Supabase, Vercel Postgres/Prisma Postgres, RDS, etc.). Use the **pooled** connection string for `DATABASE_URL` and the **direct** one for `DIRECT_URL`.
2. **Environment variables** (Vercel → Project → Settings → Environment Variables): everything in `.env.example`. In production set:
   - `PAYMENT_PROVIDER="razorpay"`, Razorpay keys, `PAYMENT_SIMULATOR_ENABLED="false"`
   - `DEV_TOOLS_ENABLED="false"`
   - `APP_URL` to your HTTPS domain
   - a real `EMAIL_PROVIDER` (see DEVELOPMENT_STATUS — required for student activation)
3. **Build command:** Vercel uses `npm run vercel-build` automatically, which runs `prisma generate && prisma migrate deploy && next build`.
4. **Region:** `vercel.json` pins functions to Mumbai (`bom1`); put the database in the same region.
5. **Cron:** `vercel.json` schedules `/api/cron/expire-orders` daily (Hobby plan limit). Unpaid orders are also expired automatically before every checkout and whenever the kitchen board loads. On a Pro plan you can run it every 15 minutes.
6. **Razorpay:** Dashboard → Webhooks → URL `https://<domain>/api/payments/razorpay/webhook`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`. Enable **automatic capture** and UPI on the account. Start with **test-mode** keys.
7. **Do not seed production.** Create the first admin account with a one-off script or SQL, then create everyone else from the staff portal.

### Production checklist

- HTTPS only (Vercel default); HSTS is sent in production.
- Session cookie is `__Host-cb_session` (Secure, HttpOnly, SameSite=Lax) in production.
- Backups: enable PITR on the managed database and test a restore before launch.
- Logging: server errors go to `console.error` (visible in Vercel logs). Add a log drain / error tracker (e.g. Sentry) for alerting.
- Rotate the demo passwords out — or better, never seed production.

---

## Design system

All colours are CSS variables in `src/app/globals.css` (`@theme`), exposed as Tailwind utilities (`bg-primary`, `text-ink`, `border-line`, `bg-accent-soft`, …). Change a value once to re-theme the whole product.

| Token | Value | Use |
|---|---|---|
| `bg` | `#F8FAF7` | app background |
| `surface` | `#FFFFFF` | cards |
| `primary` / `primary-hover` | `#173F35` / `#245B4B` | CTAs, active navigation |
| `accent` | `#28A879` | badges, icons, progress (never small text — 3:1 on white) |
| `ink` | `#26332F` | main text |
| `muted` | `#75817B` | secondary text ≥14px (4.1:1) |
| `subtle` | `#66716B` | small captions (5:1, keeps tiny text AA) |
| `line` | `#E5EBE6` | borders |
| `success` / `warning` / `danger` | `#168653` / `#E9A23B` / `#D94B4B` | feedback |

Each order status has its own colour (`src/components/ui/badge.tsx` → `STATUS_TONE`).
