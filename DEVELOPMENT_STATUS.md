# Development status

Last updated: 20 Nov 2026 · Live at https://getcampusbite.vercel.app

Legend: ✅ done & verified · 🟡 works, needs attention · ⛔ not built

## Summary

| Area | Status | Notes |
|---|---|---|
| Public website | ✅ | Landing, about, support, privacy, terms, refund and shipping policies |
| Customer sign-in | ✅ | **Google only** (Supabase Auth, PKCE). First sign-in creates a `USER`; Google app published (*In production*). Verified live and on localhost |
| Staff / kitchen sign-in | ✅ | Email + password, accounts created only by an administrator, temporary password → forced change, admin reset. Verified live and on localhost |
| Role-based access | ✅ | Enforced in middleware, layouts, pages, server actions, API routes and services; roles read only from the database |
| Customer portal | ✅ | Menu (compact list on phones, photo grid on larger screens), cart & checkout, Razorpay payment, live tracking with pickup QR/code, cancel, profile, delete account |
| Kitchen portal | ✅ | Orders board with pause/resume, accept → prepare → ready, pickup verification (QR camera + code), history, menu |
| Staff portal | ✅ | Dashboard, orders, users, menu, payments & refunds, reports + CSV, accounts, settings + activity log |
| Payments | ✅ | Razorpay **live**; signature + server-side fetch before confirming; idempotent webhooks; a duplicate second payment is refunded automatically |
| Refunds | ✅ | Normal speed (5–7 working days); never shown as refunded before staff confirm the bank credit; double-refund protection |
| Realtime | ✅ | SSE + polling fallback, filtered per user/role |
| Tests | ✅ | 98 passing (unit + integration) |
| Deployment | ✅ | Vercel (Singapore) + Neon Postgres; daily cron for reconciliation, expiry and cleanup |

## Known gaps

- **Unused tables** `PasswordReset` and `RecoverySession` (old email recovery). Kept because dropping them is a destructive migration; drop them in a later migration once approved.
- **Dependency advisories** (`npm audit`): PostCSS and Prisma's config loader (build-time tooling only) and Zod < 4.6.6 (memory use on very large inputs; requests are capped at 2 MB). Each fix needs a major upgrade (Next 16, Prisma 7, Zod 4) — plan it separately and retest.
- **CSP** allows `'unsafe-inline'` scripts (Next.js inline bootstrap). Nonce-based CSP is a hardening follow-up.
- **No automated browser (E2E) tests**; flows were checked by hand in a local production build. Playwright for the main flows is a sensible next step.
- **QR scanning** uses `BarcodeDetector` (Chrome/Edge). Safari/iOS staff type the 6-character code instead.
- **Neon cold starts**: the free database sleeps when idle; the app allows 15 s to connect so the first request after a quiet period does not fail.
- **Vercel Hobby** runs the cron once a day; expiry also runs at checkout and when the kitchen board loads.

## Decisions log

- Customers: Google only. Staff/kitchen: admin-managed email + password. CampusBite issues its own HTTP-only DB session; roles always come from CampusBite's database, never from Google or Supabase.
- Supabase is used only with the public anon key; no service-role key is stored.
- Realtime via SSE + an event table instead of Socket.IO — works on serverless without another service.
- Money stored as `DECIMAL(10,2)`, computed in integer paise.
- Orders are confirmed only by `confirmPayment()` after verified payment; row lock + compare-and-set make it idempotent.
- Images stored in Postgres to avoid a separate object store for a small menu.
