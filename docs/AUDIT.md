# CampusBite audit — 20 Nov 2026

Branch `audit/cleanup-security-perf`. Production was not changed by this work until the branch is merged. Tests used the local database and Razorpay **test mode**; no real payments or refunds were made, and no production rows were modified (production was only read, to count rows).

## 1. Code removed

| Removed | Why it was safe |
|---|---|
| `staffCancelOrderAction` | Server action with no button or caller anywhere |
| `hasPermission`, `isCanteenPermission`, `isStaffPermission` | Never called; `assertPermission` and the service checks are what is used |
| `ORDER_STATUS_TONE`, `TRACKER_STEPS`, `PAYMENT_STATUS_TONE`, `Tone` | Never imported; badges use their own tone maps |
| `isPaidStatus` | Never called |
| unused `changeOrderStatus` import | — |
| `/account/password → /` redirect | Leftover from Google-only staff login; it would have hidden the staff password page |

Every file under `src/` is imported somewhere, and every package in `package.json` is used. Obsolete email sign-up, OTP and recovery code had already been removed. Docs (`README.md`, `DEVELOPMENT_STATUS.md`) were rewritten to match the current sign-in.

Kept on purpose: the unused tables `PasswordReset` and `RecoverySession` (dropping them is a destructive migration that needs approval), and the payment simulator (used by tests and for local work).

## 2. Security

Checked: every server action, API route and page guard; sessions and cookies; payment verification; webhooks; refunds; pickup codes; uploads; secrets; raw SQL; HTML injection; security headers.

| Finding | Severity | Fix |
|---|---|---|
| A customer who paid **twice** for one order (e.g. two tabs) had the second payment only written to the audit log, never refunded | High (customer money) | The duplicate is now refunded automatically and in full; tagged so a retried webhook never refunds it twice. Test added |
| Login limit of 5 tries per email let anyone lock the admin out for 15 minutes | Medium | 5 tries per email + network, 30 per email per hour, 40 per network |
| Payment verify and *Check payment status* had no rate limit (each call hits Razorpay's API) | Low | 20 per user per 10 minutes |
| A photo uploaded while editing a non-existent menu item was stored anyway | Low | Item checked first |
| Logged-out visit to `/account/password` went to the customer login | Low | Goes to the Staff Login |
| A brief network drop while starting a Razorpay payment failed the checkout (seen twice locally: the SDK crashes with "reading 'status'" when it gets no response) | Medium (lost sales) | Order creation is retried once (it moves no money); if it still fails, the order is cancelled and the customer is told they were not charged. Test added |

Confirmed secure (tested): roles come only from the database; users cannot open other users' orders or payment pages; staff/kitchen/customer portals refuse other roles; forged payment confirmations, cross-site requests, unsigned webhooks and unauthorised cron calls are refused; payments are confirmed only after signature + server-side fetch from Razorpay with amount and currency checks; webhooks are processed once; one refund per payment with a database claim against double sending; pickup codes are single use; uploads are checked by file content; no secrets in browser code (only `.env.example` was ever committed); only parameterised SQL; QR SVGs are generated server-side; error pages show no internals; cookies are `__Host-`, HttpOnly, Secure, SameSite=Lax; CSP, HSTS, X-Frame-Options DENY, nosniff and Referrer-Policy are sent.

Dependency advisories (`npm audit`): PostCSS (inside Next) and `deepmerge-ts` (Prisma CLI config) only affect build tooling; Zod < 4.6.6 can use a lot of memory on huge inputs, and requests are capped at 2 MB. Each fix needs a major upgrade (Next 16 / Prisma 7 / Zod 4); not done without approval.

## 3. Performance

- JavaScript: shared 103 kB (React + Next.js); the heaviest page (cart) adds 21 kB. Nothing large to split.
- Server response, local production build: staff pages 30–170 ms, kitchen 28–64 ms, customer pages under 100 ms.
- Every list is capped (50–300 rows) or paginated; indexes cover the main queries.
- Phones now download 96 px menu thumbnails instead of full-width photos.
- New daily cleanup of expired sessions, live-update events older than 3 days and old rate-limit counters (never orders, payments, refunds, users or audit logs). These tables had no cleanup before.
- Database connect timeout raised from 5 s to 15 s: the free Neon database sleeps when idle, and the first query after a quiet period failed every time from a local machine.

## 4. Interface

- Phone menu: compact rows (thumbnail, name, price, Add) instead of one large photo card per screen; about 3–4 dishes per screen instead of 1. Tablets and desktops keep the photo grid.
- Search and *Veg only* share one row on phones; shorter search hint.
- Cart line reads "₹15 each" instead of "₹15 · 1 × item".
- A cancelled, unpaid order shows "Payment: Not paid" instead of a red "Failed".
- No horizontal scrolling on any customer page at 375 px; tablet layout checked at 768 px.

## 5. Tests

| Check | Result |
|---|---|
| Production build, TypeScript, ESLint | PASS |
| Automated tests (99) | PASS |
| Unauthenticated access to portals, APIs, cron, webhook | PASS |
| Security headers | PASS |
| Staff login: wrong password refused, correct password, all 10 staff pages load | PASS |
| Staff account refused at Kitchen Login | PASS |
| Kitchen login, order board, accept order | PASS |
| Kitchen blocked from staff and customer pages | PASS |
| Pickup: invalid code, valid code → collected, reused code refused | PASS |
| Logout (staff, kitchen) | PASS |
| Customer Google sign-in (localhost and live) | PASS |
| Session survives server restart | PASS |
| Menu, add to cart, totals, missing-phone check | PASS |
| Order placed, Razorpay test checkout opens with prefilled phone | PASS |
| Razorpay contact step skipped | PASS with a real-looking number; Razorpay itself rejects the placeholder 9876543210 |
| Check payment status (Razorpay test API) | PASS |
| Cancel unpaid order | PASS |
| Customer opening another customer's order/payment, staff/kitchen pages, CSV export, forged payment | PASS (all refused) |
| Profile: invalid name/phone rejected, valid save | PASS |
| Phone (375 px) and tablet (768 px) layouts | PASS |
| Successful Razorpay test payment in the browser | NOT TESTED in the browser: Razorpay's test bank page opens a pop-up that the embedded browser cannot show. Covered by 20 automated Razorpay tests |
| Staff refund processing in the browser | NOT TESTED in the browser (needs a paid test order). Covered by automated refund tests |
| Live payments, live refunds | NOT TESTED (real money) |

## 6. Remaining

- Merge the branch after review; Vercel then deploys it.
- Drop `PasswordReset` / `RecoverySession` in a later migration (needs approval).
- Plan the major upgrades (Next 16, Prisma 7, Zod 4) as a separate piece of work.
- Optional: nonce-based CSP; Playwright end-to-end tests; a paid Vercel plan for more frequent cron runs and longer log retention.
