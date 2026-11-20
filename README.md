# CampusBite

College canteen pre-ordering platform. Users order from anywhere on campus, pay online (UPI via Razorpay), track their order live and collect it with a one-time pickup code. The canteen works from a simple tablet board; college staff get orders, reports, payments, refunds, accounts and an activity log.

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
- **Auth:** customers sign in with **Google only** (Supabase Auth runs the OAuth/PKCE flow); a first Google sign-in creates a `USER` account. Staff and kitchen accounts are created by an administrator and sign in with email + password. In both cases CampusBite then issues its own HTTP-only session (`src/lib/auth/session.ts`), so every role decision stays on the server.

---

## Project structure

```
prisma/
  schema.prisma          relational model (User, UserProfile, Order, Payment, Refund, PickupToken, AuditLog, …)
  migrations/            SQL migrations
  seed.ts, seed-data.ts  demo data (development only)
src/
  app/
    (site)/              public website: landing, about, support, privacy, terms
    login/, activate/    three login portals + user registration
    auth/confirm/        landing page for Supabase activation / reset links
    user/             user portal
    canteen/             canteen portal (orders board, pickup, menu, settings)
    staff/               staff/admin portal (dashboard, users, canteen, food, payments, reports, team, audit)
    actions/             server actions (thin wrappers: authenticate → call service)
    api/                 events (SSE), Razorpay verify/webhook, images, CSV export, cron
  lib/
    auth/                sessions, passwords, guards, permissions, rate limiting, login,
                         supabase.ts + user-auth.ts (user registration via Supabase Auth)
    orders/              state machine, pricing, order creation, transitions, pickup, expiry
    payments/            gateways, signature verification, confirmation, refunds, simulator, webhooks
    realtime/            event publishing
    reports.ts, admin.ts, menu.ts, kitchen.ts, audit.ts
  components/            design system (ui/), portal shell, feature components
tests/                   unit + integration tests
```

Business logic lives in `src/lib/**` as plain functions that take an explicit `Actor`. Server actions and routes only authenticate and delegate — that's what makes the logic testable and keeps permission checks in one place.

---

## The three portals

| Portal | Menu | What it's for |
|---|---|---|
| **User** (`/login`, Google) | Home · Cart · My Orders · Profile | Home = menu with search and categories plus your current order. Cart = items, pickup time and Pay on one page. My Orders = live tracking with pickup code/QR on top, past orders below. Profile = details, delete account. |
| **Canteen** (`/login/canteen`) | Orders · Verify pickup · History · Menu | Orders board in four columns (New, Preparing, Ready, Completed) with big action buttons and a Pause/Resume switch for new orders. Verify pickup by QR or code. Menu = add/edit food, prices, sold out. |
| **Staff** (`/login/staff`) | Dashboard · Orders · Users · Menu · Payments · Reports · Accounts · Settings | Dashboard = today's numbers + latest orders. Accounts = canteen and staff accounts (tabs). Settings = kitchen hours/fees and the activity log (tabs). Menu items depend on each staff member's permissions. |

Order flow: **Browse food → Add to cart → Pay → Track → Collect.** An order is confirmed only after the server verifies the payment; the canteen then accepts it, prepares it, marks it ready (the user is notified) and hands it over after checking the single-use pickup code.

Old links keep working: `/user/menu` → Home, `/user/history` → My Orders, `/user/checkout` → Cart, `/canteen/settings` → Orders board.

## Roles

| Role | Who | How the account is created | Portal |
|---|---|---|---|
| `USER` | Students, teachers and all college employees who order food | Automatically on the first **Continue with Google** | `/login` → `/user/dashboard` |
| `STAFF` | Authorised administrators who manage the platform | Created by an administrator only (email + password) | `/login/staff` |
| `CANTEEN` | Canteen operators who manage food items and orders | Created by an administrator only (email + password) | `/login/canteen` |

The role is always assigned on the server and read from CampusBite's database — never from a form or from Supabase.

**Renamed from `STUDENT`:** the `USER` role was previously called `STUDENT`. Migration `20261116140000_role_user_rename` renames it in place (`ALTER TYPE … RENAME VALUE`), renames the `StudentProfile` table to `UserProfile` and `RealtimeEvent.studentUserId` to `forUserId`, and relabels stored `'STUDENT'` values in order-history and audit rows. Migration `20261116140100_staff_permission_users` renames the staff permission `STUDENTS` to `USERS`. No rows are deleted; accounts, orders, payments and relationships are unchanged. Old URLs (`/student/*`, `/login/student`, `/staff/students/*`) permanently redirect to the new ones. Audit entries written before the rename keep their original `student.*` action names.

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
| User | `aarav.sharma@college.edu` | `Student@123` | 10 fictional demo users (see `prisma/demo-students.ts`), all share this password |
| Staff (admin) | `admin@college.edu` | `Staff@123` | every staff permission |
| Staff (accounts) | `finance@college.edu` | `Staff@123` | users, payments, reports, audit only |
| Canteen (manager) | `kitchen@college.edu` | `Canteen@123` | orders, menu, settings |
| Canteen (counter) | `counter@college.edu` | `Canteen@123` | orders only |

Demo **users** keep their seeded password hash but customers can only sign in with Google, so locally use *Continue with Google* (Supabase must be configured) or the staff/kitchen accounts.

**Testing two roles at once in one browser:** cookies are per host, so use `http://localhost:3000` for one role and `http://127.0.0.1:3000` (or `127.0.0.2`) for another.

---

## Sign-in

| Who | Where | How |
|---|---|---|
| Customers | `/login` | **Continue with Google** only. The first Google sign-in creates a `USER` account; later sign-ins find it by Google identity, then by email, so one person never gets two accounts. |
| Staff | `/login/staff` | Email + password. Accounts are created only by an administrator (**Staff → Accounts**) with a one-time temporary password that must be changed at first sign-in. |
| Kitchen | `/login/canteen` | Same as staff, under **Staff → Canteen operators**. |

- Google never creates, links or promotes staff/kitchen accounts: a staff or kitchen email that arrives through Google is refused ("Staff and kitchen accounts can't use Google…").
- Forgotten staff/kitchen passwords are reset by an administrator (**Reset password** gives a new temporary password and signs the person out).
- The very first administrator sets their password from a terminal, never through chat or a web form: `npx tsx prisma/set-password.ts you@example.com` (runs against `DATABASE_URL`; the password is typed hidden and never printed).
- Limits: 5 password attempts per email + network every 15 minutes, 30 per email per hour, 40 per network; Google callback 30 per network per 15 minutes.

### Delete account

Customers can permanently delete their account from **Profile → Delete account** (type `DELETE`). It cannot be undone:

- Personal data (name, email, mobile, preferences, notifications, sessions) is erased.
- Accounts with no orders are removed completely. Accounts with past orders are anonymised (`Deleted user`, placeholder email) so orders and payments stay as anonymous records for the canteen's accounts; unpaid orders are cancelled.
- Deletion is refused while an order is being prepared, is ready, or has a refund pending. Staff cannot restore a deleted account.
- Signing in with Google again later starts a brand-new, empty account.

### Supabase + Google configuration

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Project URL (Supabase → Project Settings → API) |
| `SUPABASE_ANON_KEY` | The project's **anon / publishable** key. The service-role key is **not** needed. |
| `APP_URL` | Public HTTPS address, e.g. `https://getcampusbite.vercel.app` |

1. **Google Cloud → Google Auth Platform:** External app, published (*In production*); Branding with home, privacy (`/privacy`) and terms (`/terms`) links; a *Web application* OAuth client whose redirect URI is `https://<project>.supabase.co/auth/v1/callback`. Requests only name and email, so no Google review is needed (adding a logo would trigger one).
2. **Supabase → Authentication → Sign In / Providers → Google:** enabled, with that client's ID and secret.
3. **Supabase → URL Configuration:** Site URL = `APP_URL`; Redirect URLs include `https://getcampusbite.vercel.app/**` and `http://localhost:3000/**` (local sign-in therefore needs port 3000).
4. Run [`supabase/delete_own_user.sql`](supabase/delete_own_user.sql) once in the SQL Editor: a refused Google sign-in removes its stray Supabase login without storing a service-role key.

## Tests

```bash
npm test
```

98 tests. Integration tests run against `<your database>_test` (created/migrated automatically with `prisma migrate deploy`; tables are truncated per test — the runner refuses any database not ending in `_test`). Covered:

- Google sign-in (Supabase replaced by an in-memory fake with PKCE): first sign-in creates one USER, simultaneous first sign-ins, returning users, deactivated accounts, identity takeover, staff/kitchen emails refused; staff/kitchen password login, wrong portal, temporary password → forced change, admin reset, rate limiting (incl. atomicity under concurrency)
- Menu availability, cart calculations, server-side pricing (client prices ignored)
- Order creation idempotency under 6 simultaneous submissions; 8 users ordering at once; kitchen capacity
- Payment verification, amount/currency mismatch (fake confirmation), cross-user payment attempts, failed-then-retried payments
- Webhook signature verification and duplicate-delivery idempotency
- Status transitions: skipped steps, wrong roles, missing permissions, concurrent updates
- Refunds: rejection auto-refund, late payment after expiry, single gateway call under concurrent clicks, duplicate second payment refunded exactly once
- Daily cleanup removes only expired sessions, old live-update events and stale rate-limit counters
- Pickup: single use, concurrent scans, not-ready orders, mismatched QR, wrong roles

---

## Deployment (Vercel + managed PostgreSQL)

1. **Database:** create a managed Postgres with point-in-time recovery (Neon, Supabase, Vercel Postgres/Prisma Postgres, RDS, etc.). Use the **pooled** connection string for `DATABASE_URL` and the **direct** one for `DIRECT_URL`.
2. **Environment variables** (Vercel → Project → Settings → Environment Variables): everything in `.env.example`. In production set:
   - `PAYMENT_PROVIDER="razorpay"`, Razorpay keys, `PAYMENT_SIMULATOR_ENABLED="false"`
   - `APP_URL` to your HTTPS domain
   - `SUPABASE_URL` and `SUPABASE_ANON_KEY`, with the Google provider configured (see *Supabase + Google configuration*) — required for customer sign-in
3. **Build command:** Vercel uses `npm run vercel-build` automatically, which runs `prisma generate && prisma migrate deploy && next build`.
4. **Region:** `vercel.json` pins functions to Singapore (`sin1`); put the database in the same region.
5. **Cron:** `vercel.json` schedules `/api/cron/expire-orders` daily (Hobby plan limit): it reconciles missed payments and refunds, expires unpaid orders and purges expired sessions, old live-update events and stale rate-limit counters. Unpaid orders are also expired automatically before every checkout and whenever the kitchen board loads. On a Pro plan you can run it every 15 minutes.
6. **Razorpay Test Mode (no real money):** create a Razorpay account (no KYC needed for Test Mode) → **Get test keys**. Put `RAZORPAY_KEY_ID` (`rzp_test_…`) and `RAZORPAY_KEY_SECRET` in `.env` locally, or in Vercel → Project → Settings → Environment Variables, together with `PAYMENT_PROVIDER="razorpay"` and `PAYMENT_SIMULATOR_ENABLED="false"`. Live keys (`rzp_live_…`) are refused unless `RAZORPAY_ALLOW_LIVE="true"`. Test card: `4386 2894 0766 0153`, any future expiry, any CVV, any OTP. UPI (app redirect on phones, QR on laptops) appears first in checkout once UPI is enabled on the Razorpay account.
7. **Razorpay webhooks:** Dashboard → Webhooks → URL `https://<domain>/api/payments/razorpay/webhook`, events `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`, `refund.failed`, secret = `RAZORPAY_WEBHOOK_SECRET`. Enable **automatic capture** and UPI on the account. Start with **test-mode** keys.
8. **Do not seed production.** Set the first administrator's password with `npx tsx prisma/set-password.ts <email>`, then create everyone else from the staff portal.

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
