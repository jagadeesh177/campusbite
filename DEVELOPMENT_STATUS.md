# Development status

Last updated: 16 Nov 2026

Legend: ✅ done & verified · 🟡 done, needs external setup · ⛔ not built yet

## Summary

| Area | Status | Notes |
|---|---|---|
| Public website | ✅ | Landing (hero, how it works, features, contact), about, support, privacy, terms |
| Authentication & sessions | ✅ | 3 portals, DB sessions, bcrypt, rate limiting, forced password change for admin-created accounts |
| Role-based access | ✅ | Enforced in layouts, pages, server actions, API routes and services |
| User registration | ✅ | Any personal email via **Supabase Auth** (pending `USER` account → activation link → create password → dashboard), resend with rate limiting, password reset; 20 tests against a Supabase fake. **Real delivery verified** on 16 Nov 2026 through Supabase custom SMTP (Gmail, sender *CampusBite*): the *Activate Your CampusBite Account* email reached a Gmail inbox and its link opened *Create Your Password* on the live site; a second activation was sent to another Gmail account. Gmail SMTP allows ~500 emails/day — switch Supabase SMTP to Resend with a verified domain for larger volume |
| User portal | ✅ | Dashboard, menu, cart, checkout, pickup slots, payment, live tracking, QR, history, profile |
| Canteen portal | ✅ | Order board, accept/reject/prepare/ready, pickup verification (QR camera + manual), menu, settings |
| Staff portal | ✅ | Dashboard, users, canteen accounts, staff accounts, food, payments/refunds, reports + CSV, audit log, settings |
| Payments | 🟡 | Razorpay integration written (orders, checkout verification, webhooks, refunds) but **not yet run against real Razorpay** — needs merchant keys. Simulator verified |
| Refunds | ✅ | Automatic on rejection/late payment; staff retry; double-refund protection |
| Pickup tokens | ✅ | Single use, order-bound QR, concurrent-scan safe |
| Realtime | ✅ | SSE + polling fallback, audience-filtered |
| Tests | ✅ | 66 passing (unit + integration) |
| Deployment config | 🟡 | `vercel.json`, `vercel-build`, env template — not yet deployed |

## Requires external credentials or authorisation

1. **Razorpay (UPI).** Create a Razorpay account (business KYC), enable UPI and auto-capture, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_PROVIDER=razorpay`, and configure the webhook (see README). Then run a test-mode payment, a failed payment and a refund end to end before going live. Until then the app uses the **development simulator**, which is labelled everywhere it appears and never described as a real payment.
2. **Supabase Auth + Resend (user registration emails).** Set `SUPABASE_URL` and `SUPABASE_ANON_KEY`, configure the Supabase email templates, OTP expiry and Resend SMTP (README → *Supabase + Resend configuration*). Resend needs a **verified domain** to send to users' own inboxes. Until a real registration email has been received end to end, delivery is **not** confirmed.

## Verified manually in the browser (production build)

- Landing page, all three login portals, activation page
- Full order lifecycle across two portals: user orders → simulated UPI → canteen accepts → preparing → ready → pickup by code → collected; user page updated live at each step without reloading
- Pickup code reuse refused ("Already collected — do not hand over again")
- Canteen reject with reason → automatic refund → visible in staff payments and audit log
- Staff processes a pending refund; reports (weekly), CSV export, audit log
- Kitchen settings change (extended hours) takes effect immediately for users
- Unauthenticated access: portals redirect, `/api/events`, `/api/staff/export`, cron return 401; unsigned webhook returns 400; security headers present
- Mobile (375px): user dashboard and menu, no horizontal overflow; canteen board at phone and tablet widths

## Known gaps & limitations

- The `STUDENT` role is now `USER` (see README → Roles). Audit entries written before the rename keep their old `student.*` action names.

- ✅ **Forgot password** for users via single-use email link (`/forgot-password`). Staff/canteen passwords are reset by an administrator.
- **Demo users** from the seed script have no Supabase account; they sign in with the local demo password until they use *Forgot password*, which moves them to Supabase.
- The old college-verification tables (`VerificationCode`, `StudentAccessToken`, `DevMailMessage`) are no longer used and can be dropped in a later migration.
- **QR camera scanning** uses the browser `BarcodeDetector` API (Chrome/Edge on Android and desktop). Safari/iOS doesn't support it, so the pickup screen falls back to typing the 6-character code.
- **Food images** are generated illustrations. Upload real photos from Canteen → Menu → Edit (stored in Postgres, max 1.5 MB, JPEG/PNG/WebP verified by file content).
- **CSP** allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Moving to nonce-based CSP is a hardening follow-up.
- **No automated browser (E2E) tests** yet; UI flows were verified manually. Playwright tests for the main flows are a sensible next step.
- **Vercel Hobby** allows only a daily cron; expiry also runs on every checkout and kitchen-board load, so this is not a correctness issue.
- CSV export filenames use the UTC date.

## Decisions log

- Realtime via SSE + event table instead of Socket.IO — works on serverless without another paid service.
- Users authenticate with Supabase Auth, after which CampusBite issues its own HTTP-only DB session; staff/canteen keep admin-managed passwords. Roles always come from CampusBite's database, never from Supabase.
- Supabase is called only with the public anon key on behalf of the user; no service-role key is stored.
- Money stored as `DECIMAL(10,2)`, computed in integer paise.
- Order confirmation only through `confirmPayment()` after signature + server-side checks; row lock + compare-and-set make it idempotent.
- Activation never reveals whether an email belongs to a user (no enumeration).
- Images stored in Postgres to avoid a separate object store for a small menu.
