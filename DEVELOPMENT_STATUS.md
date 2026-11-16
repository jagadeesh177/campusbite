# Development status

Last updated: 16 Nov 2026

Legend: ✅ done & verified · 🟡 done, needs external setup · ⛔ not built yet

## Summary

| Area | Status | Notes |
|---|---|---|
| Public website | ✅ | Landing (hero, how it works, features, contact), about, support, privacy, terms |
| Authentication & sessions | ✅ | 3 portals, DB sessions, bcrypt, rate limiting, forced password change for admin-created accounts |
| Role-based access | ✅ | Enforced in layouts, pages, server actions, API routes and services |
| Student activation | 🟡 | Email-link activation + password reset work end to end (verified in the browser with the dev mailbox; 14 tests). **Needs SMTP/Resend credentials** in production, and verification uses the **mock** college directory |
| College integration | 🟡 | Provider interface + mock adapter + HTTP API template. **Needs the college's approved integration** |
| Student portal | ✅ | Dashboard, menu, cart, checkout, pickup slots, payment, live tracking, QR, history, profile |
| Canteen portal | ✅ | Order board, accept/reject/prepare/ready, pickup verification (QR camera + manual), menu, settings |
| Staff portal | ✅ | Dashboard, students, canteen accounts, staff accounts, food, payments/refunds, reports + CSV, audit log, settings |
| Payments | 🟡 | Razorpay integration written (orders, checkout verification, webhooks, refunds) but **not yet run against real Razorpay** — needs merchant keys. Simulator verified |
| Refunds | ✅ | Automatic on rejection/late payment; staff retry; double-refund protection |
| Pickup tokens | ✅ | Single use, order-bound QR, concurrent-scan safe |
| Realtime | ✅ | SSE + polling fallback, audience-filtered |
| Tests | ✅ | 70 passing (unit + integration) |
| Deployment config | 🟡 | `vercel.json`, `vercel-build`, env template — not yet deployed |

## Requires external credentials or authorisation

1. **Razorpay (UPI).** Create a Razorpay account (business KYC), enable UPI and auto-capture, set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENT_PROVIDER=razorpay`, and configure the webhook (see README). Then run a test-mode payment, a failed payment and a refund end to end before going live. Until then the app uses the **development simulator**, which is labelled everywhere it appears and never described as a real payment.
2. **Email delivery.** SMTP (e.g. Gmail app password) and Resend adapters are implemented (`src/lib/email.ts`) and unit-tested with a mocked transport, but **no real credentials are configured yet**, so the live site cannot deliver activation links. Set `EMAIL_PROVIDER=smtp` + `SMTP_*` (or `resend` + `RESEND_API_KEY`) in Vercel, then send a test activation to a real inbox.
3. **College integration.** Only the mock directory is active. To connect the real system, the college must approve one of: official API, OIDC/SAML SSO, read-only DB access, or CSV sync. See `src/lib/college/README.md`.

## Verified manually in the browser (production build)

- Landing page, all three login portals, activation page
- Full order lifecycle across two portals: student orders → simulated UPI → canteen accepts → preparing → ready → pickup by code → collected; student page updated live at each step without reloading
- Pickup code reuse refused ("Already collected — do not hand over again")
- Canteen reject with reason → automatic refund → visible in staff payments and audit log
- Staff processes a pending refund; reports (weekly), CSV export, audit log
- Kitchen settings change (extended hours) takes effect immediately for students
- Unauthenticated access: portals redirect, `/api/events`, `/api/staff/export`, cron return 401; unsigned webhook returns 400; security headers present
- Mobile (375px): student dashboard and menu, no horizontal overflow; canteen board at phone and tablet widths

## Known gaps & limitations

- ✅ **Forgot password** for students via single-use email link (`/forgot-password`). Staff/canteen passwords are reset by an administrator.
- **Supabase Auth** was not adopted: the existing server-side auth is kept (see README → "Why not Supabase Auth?").
- **QR camera scanning** uses the browser `BarcodeDetector` API (Chrome/Edge on Android and desktop). Safari/iOS doesn't support it, so the pickup screen falls back to typing the 6-character code.
- **Food images** are generated illustrations. Upload real photos from Canteen → Menu → Edit (stored in Postgres, max 1.5 MB, JPEG/PNG/WebP verified by file content).
- **CSP** allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Moving to nonce-based CSP is a hardening follow-up.
- **No automated browser (E2E) tests** yet; UI flows were verified manually. Playwright tests for the main flows are a sensible next step.
- **Vercel Hobby** allows only a daily cron; expiry also runs on every checkout and kitchen-board load, so this is not a correctness issue.
- CSV export filenames use the UTC date.

## Decisions log

- Realtime via SSE + event table instead of Socket.IO — works on serverless without another paid service.
- Custom DB sessions instead of Auth.js — three role-locked portals and college-verified activation fit poorly into OAuth-centric flows; all checks stay server-side.
- Money stored as `DECIMAL(10,2)`, computed in integer paise.
- Order confirmation only through `confirmPayment()` after signature + server-side checks; row lock + compare-and-set make it idempotent.
- Activation never reveals whether an email belongs to a student (no enumeration).
- Images stored in Postgres to avoid a separate object store for a small menu.
