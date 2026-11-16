# CampusBite audit — 16 Nov 2026

Phase 1 of the simplification task: what exists today, what is broken, what is duplicated, and the proposed changes. Nothing structural has been changed yet.

## 1. What exists

| Area | Pages / pieces |
|---|---|
| Public site | Landing, About, Support, Privacy, Terms, Photo credits, portal chooser (`/login`) |
| Auth | User Login, Staff Login, Canteen Login, Create account (`/activate`), `/auth/confirm` (create/reset password), Forgot password, Change password (`/account/password`), Goodbye (after deletion) |
| User portal (6 menu items) | Dashboard, Food Menu, My Cart, My Orders, Order History, Profile — plus Checkout, Pay, Order detail |
| Canteen portal | Orders board (New / Preparing / Ready / Completed), Verify pickup, Menu, Kitchen settings |
| Staff portal (9 menu items) | Dashboard, Users, Canteen accounts, Food & menu, Payments, Reports, Staff accounts, Audit log, Kitchen settings |
| APIs | Realtime events (SSE), Razorpay verify + webhook, food images, CSV export, order-expiry cron |
| Tests | 72 automated tests (auth, registration, account deletion, orders, payments, refunds, pickup, permissions) |

## 2. Broken or wrong (fix first)

| # | Problem | Impact |
|---|---|---|
| B1 | **Change password is broken for every newly registered user.** `/account/password` checks the old local password, but Supabase users have none, so it always says "Current password is incorrect". | Users can't change their password while signed in (Forgot password still works). |
| B2 | **Staff can't see all orders.** There is no orders page in the staff portal (spec requires "View all orders"); orders are only visible per user or via payments. | Staff can't look up an order quickly. |
| B3 | Live site runs the **payment simulator** ("Public demo"). Razorpay code exists but has never run with real keys. | No real money can be taken until Razorpay keys are added (external credential — see §6). |
| B4 | Staff dashboard and Users list still show **"Student ID"** and enrollment fields that new users never have (always "—"). | Clutter / confusion. |

## 3. Duplicated features

| # | Duplicate | Proposal |
|---|---|---|
| D1 | **Order History** and **My Orders** are two pages for the same list (active vs past). | One **My Orders** page: active orders on top, past orders below. Old `/user/history` redirects. |
| D2 | **Dashboard** and **Food Menu** both show food with "Add" buttons. | One **Home** page = food menu with search + category filter, with the active order card on top. |
| D3 | **My Cart** page + **Checkout** page = two steps before paying. | Cart becomes a slide-up panel / sticky bar; one **Checkout** page (review items + pickup time + Pay). |
| D4 | **Food & menu** exists in both Staff and Canteen portals (same component). | Keep it in Canteen (daily use: prices, sold out). Staff keeps **categories** + read access via the same page only if they also have the permission — no second copy in the menu. |
| D5 | **Kitchen settings** exists in both Staff and Canteen portals. | Keep one copy, in Staff → **Settings** (platform settings); canteen gets a simple "Accepting orders" on/off switch on its Orders board. |

## 4. Too complicated / low value

| # | Item | Proposal |
|---|---|---|
| C1 | User menu has 6 entries (desktop) / 5 tabs (mobile). | **Home · My Orders · Profile** (+ cart button). |
| C2 | Staff menu has 9 entries. | **Dashboard · Orders · Users · Payments · Reports · Team** (Team = canteen + staff accounts on one page with tabs) · **Settings** · Activity log moves under Settings. |
| C3 | Canteen menu: Orders, Verify pickup, Menu, Kitchen settings. | **Orders** (with a big "Verify pickup" button on the board) · **Menu** · **History**. |
| C4 | Staff dashboard has 6 stat cards + charts. | 4 numbers that matter today (orders, revenue, pending refunds, orders in progress) + latest orders list. Charts stay only in Reports. |
| C5 | Technical wording in places ("Realtime", "Live" badge, "simulator", "audit log", IDs). | Plain words: "Updates automatically", "Activity log", etc. |
| C6 | Profile shows academic fields (programme, year, student ID) for users who never entered them. | Show only name, email, mobile, department (if given), preferences, password, delete account. |

## 5. Code quality / performance

| # | Finding | Proposal |
|---|---|---|
| Q1 | `react-hook-form` and `@hookform/resolvers` are installed but never imported. | Remove. |
| Q2 | Legacy tables `VerificationCode`, `StudentAccessToken`, `DevMailMessage` and enums are unused since the Supabase switch. | Drop in a migration (they hold only expired one-time codes / dev emails — no business data). |
| Q3 | Old Vercel env vars no longer used: `EMAIL_PROVIDER`, `EMAIL_FROM`, `SMTP_*`, `COLLEGE_*`, `MOCK_EXTRA_STUDENTS`, `DEV_TOOLS_ENABLED`. One of them stores an old Gmail app password. | Remove from Vercel. |
| Q4 | Food photos are ~150–400 KB JPEGs served as-is. | Serve through Next/Image (resizing + WebP) where not already. |
| Q5 | Audit entries written before the rename use `student.*` action names. | Keep (history); display both names nicely in the activity log. |

Security checks that **passed** (keep as is): roles come only from the database; each portal rejects other roles (tested); payment confirmation only after server-side verification + idempotent webhook (tested); duplicate orders blocked by idempotency key (tested); pickup codes single-use (tested); rate limits on login, sign-up, reset and delete; HTTP-only sessions; CSP + security headers.

## 6. Needs external credentials (cannot be completed in code)

| Integration | Status | What's needed |
|---|---|---|
| Razorpay (real UPI payments) | Code written + tested against fakes; live site uses the labelled simulator | Razorpay account (KYC), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, webhook URL in the Razorpay dashboard |
| Email (Supabase + Gmail SMTP) | **Working** (verified 16 Nov) — Gmail limit ~500/day | For more volume: Resend + a domain you own |

## 7. Proposed order of work

1. **Fix** B1 (change password via Supabase), B2 (staff Orders page), B4/C6 (remove student-only fields from UI).
2. **User portal**: Home (menu + search + active order) · My Orders (merged) · Profile; cart panel + one-page checkout. Redirect old URLs.
3. **Canteen portal**: Orders board with "Accepting orders" switch and big Verify-pickup button · Menu · History.
4. **Staff portal**: shorter menu (Dashboard, Orders, Users, Payments, Reports, Team, Settings incl. activity log), simpler dashboard.
5. **Cleanup**: remove unused packages, drop legacy tables (migration), remove old Vercel env vars, image optimisation.
6. **Test** every portal (automated + browser, mobile/tablet/desktop), update README, final report.

Nothing in this plan removes a working capability; every removed page is merged into another or redirected.

## 8. Results (implemented 16 Nov 2026)

| Item | Done |
|---|---|
| B1 Change password for registered users | ✅ goes through Supabase (current password checked); test added |
| B2 Staff can see all orders | ✅ new **Orders** page with filters, search, paging |
| B3 Real payments | ⏳ still needs Razorpay keys (external). Test-mode notices now in plain words |
| B4/C6 Student-only fields | ✅ removed from user profile, staff user list (now shows Mobile), canteen board and pickup screen (shown only when present) |
| D1 My Orders + Order History | ✅ merged into **My Orders**; `/user/history` redirects |
| D2 Dashboard + Food Menu | ✅ merged into **Home**; `/user/menu` redirects |
| D3 Cart + Checkout | ✅ one **Cart** page (edit items, pickup time, Pay); `/user/checkout` redirects |
| D4 Food & menu in two portals | Kept in both on purpose — the spec gives menu management to staff *and* canteen; same component, no duplicated code. Staff page renamed **Menu** |
| D5 Kitchen settings in two portals | ✅ only in Staff → Settings; canteen gets a **Pause/Resume orders** switch on its board |
| C1 User menu | ✅ Home · Cart · My Orders · Profile |
| C2 Staff menu | ✅ 9 → 8 items: Dashboard · Orders · Users · Menu · Payments · Reports · Accounts (tabs) · Settings (tabs incl. Activity log) |
| C3 Canteen menu | ✅ Orders · Verify pickup · History (new) · Menu |
| C4 Staff dashboard | ✅ 4 numbers + latest orders; charts only in Reports |
| C5 Plain wording | ✅ "Test mode", "Activity log", "Updates by itself" |
| Q1 Unused packages | ✅ removed `react-hook-form`, `@hookform/resolvers` |
| Q2 Legacy tables | ✅ dropped `VerificationCode`, `StudentAccessToken`, `DevMailMessage` (migration `20261116160000`) |
| Q3 Old Vercel env vars | ✅ removed 10 unused variables incl. the old stored Gmail app password |
| Q4 Images | ✅ food photos served through the Next.js image optimiser (resized, WebP) |

Remaining: Razorpay keys for real payments; Gmail sending limit (~500/day) — move Supabase SMTP to Resend with a domain for more.
