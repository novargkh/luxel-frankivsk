# LUXEL portal: notes for Claude (any session, local or cloud)

Read this before working on the project. Owner: Andrii. Speak Russian/Ukrainian
with him; UI text is Ukrainian.

## What this is
B2B client portal for LUXEL (distributor, Ivano-Frankivsk): clients order
goods, see their prices, promo codes, tasks; admins manage orders, clients,
products. Live: https://luxel-frankivsk.vercel.app (Vercel project
`luxel-frankivsk`, deploys on every push to `main` of
github.com/novargkh/luxel-frankivsk). Owner's local copy: `~/luxel-frankivsk`.

## Stack
Next.js 16 (App Router, Turbopack, middleware is `src/proxy.ts`), React 19,
Tailwind v4, Prisma 6 + Neon Postgres, NextAuth v5, `@phosphor-icons/react`.
`npm run build` = `prisma migrate deploy && next build` (migrations apply on
deploy). If a Vercel build fails with P1002 (advisory lock), just Redeploy.
Vercel limits: function maxDuration 60 s, request body 4.5 MB, no persistent
filesystem (store uploads in the DB).

## How changes reach production
- Working on the owner's computer (preferred): edit `~/luxel-frankivsk`,
  run `npx tsc --noEmit -p .` and `npx eslint <changed files>`, then commit
  and `git push` (ask first). Vercel deploys automatically.
- Working in a cloud session (no push access): clone the repo, make the
  change, commit, then build a zip of changed files
  (`git diff --name-only --diff-filter=AM origin/main HEAD | zip -q out.zip -@`)
  and give it to the owner; he runs `cd ~/luxel-frankivsk`,
  `unzip -o ~/Downloads/<zip>`, `git add prisma src docs`, `git commit -m "..."`,
  `git push`.
- Never use tokens/passwords pasted in chat. Secrets live only in Vercel
  env vars, entered by the owner: `ONE_C_EXCHANGE_LOGIN`,
  `ONE_C_EXCHANGE_PASSWORD`, `OPENROUTER_API_KEY`, `NEXTAUTH_SECRET`,
  `PASSWORD_VIEW_SECRET`, `DATABASE_URL`. Don't change Vercel settings
  without his explicit OK. Don't log into production with demo accounts.

## Areas
- Client side: catalog `/`, cart, `/quick-order` (AI: voice/photo/text,
  `src/lib/quickOrder.ts`, `src/lib/speech.ts`), `/orders`, `/returns`,
  `/promotions`, `/tasks`, `/profile`. Navbar `src/components/Navbar.tsx`
  (promo wallet with "Вхідні" group: `src/components/PromoWallet.tsx`).
- Admin `/admin/*` with its own shell `src/components/admin/AdminShell.tsx`;
  `src/proxy.ts` redirects admins away from client pages (`adminPathFor`).
  Orders list/calendar/editor, clients (cabinet passwords viewable,
  AES-GCM in `User.passwordEnc`, `src/lib/clientAccount.ts`), products,
  promo codes, KPI tasks, routes, coverage, announcements.
- Clients come only from BAF (Excel import by BAF code; several rows with
  one code add several delivery shops). Only test clients can be deleted
  (`src/lib/clientDelete.ts`): no BAF code, no order sent to BAF, typed name
  confirmation; deletes their orders and personal promo codes and tells
  the Telegram admins. Orders themselves are never deleted, only cancelled.
- Prices: `pricingFor(user)` in `src/lib/clientPrice.ts` (client's
  ClientPrice from BAF, else base price minus discount).
- KPI tasks: `src/lib/challenges.ts` (PHOTO / ORDER_PRODUCTS / ORDER_TOTAL;
  approval issues a personal one-time code from a promo "template",
  `PromoCode.isTemplate`). Photos stored as bytea (`ChallengePhoto`).

## BAF (1C) exchange
CommerceML 2 at `/1c_exchange.php` → `src/app/api/1c-exchange/route.ts`.
- `type=sale`: orders to BAF (`src/lib/onecExchange.ts`).
- `type=catalog`: goods and prices from BAF (`src/lib/cmlCatalog.ts`):
  init answers `zip=yes, file_limit=4000000`; chunks appended into
  `ExchangeFile`; import is batched and incremental; a full upload archives
  products missing in BAF (unless coverage < 50%). Progress: `SyncRun`,
  shown by `src/components/admin/SyncProgress.tsx`.
- Every request is written to `ExchangeLog`; admin page "Обмін з BAF"
  (`/admin/exchange`) shows answers and auth problems (no secrets). Check
  it first when "BAF can't connect".
- Article matching from the BAF nomenclature xls: `src/lib/bafMatch.ts`,
  admin `/admin/products/baf`.
- Protocol notes and curl examples: `docs/1c-exchange.md`.
- BAF runs on an office PC that is often off: orders queue on the site
  (basStatus NEW) until BAF connects. `src/lib/bafQueue.ts` shows the queue
  on the admin overview and sends a Telegram reminder when orders wait and
  BAF was unseen for `BAF_WAIT_ALERT_HOURS` (default 4), at most once per
  that period, 07–21 Kyiv. Checked on new orders, admin overview, bot use
  and the daily cron (no hourly cron on the Vercel Hobby plan).

## Telegram admin bot
For at most 2 people (`TELEGRAM_MAX_LINKS`). Env: `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`. Admin page `/admin/telegram`: "Підключити бота
до сайту" (setWebhook) and one-time links to connect a person
(`TelegramLink`). Webhook `/api/telegram/webhook` (secret header, public in
`src/proxy.ts`) → `src/lib/telegramBot.ts`: orders (view, confirm, ship,
cancel), availability override, photo-KPI approve/reject, issue a personal
promo code from a template. Notices (`src/lib/telegramNotify.ts`, sent with
`after()`): new order, return, profile request, KPI photo, BAF exchange
error (max one per 30 min). `TELEGRAM_API_BASE` points tests at a fake API.

## Sign-in protection
`src/lib/loginGuard.ts`: failed sign-ins are stored in `LoginAttempt`; 5 per
login or 30 per IP within 15 min block sign-in (code `too_many`). Optional
Cloudflare Turnstile captcha when `TURNSTILE_SECRET_KEY` and
`NEXT_PUBLIC_TURNSTILE_SITE_KEY` are set. Admins change their own email and
password at `/admin/account` (link under the name in the sidebar).

## Local testing
Needs a Postgres in `.env` `DATABASE_URL` (not committed; use a local DB or
a Neon branch, never the production DB for experiments). Dev server on port
3001 (NEXTAUTH_URL points there). Seed demo logins: admin@demo.local /
client@demo.local, password `password123` (local only; the login-page hint
is removed; remove demo accounts before real clients).

## Open items (as of 13.10.2026)
- Owner installs luxel-update-22 (KPI tasks + exchange journal), then
  checks "Обмін з BAF" after a BAF run: there was a complaint that BAF
  can't connect; the journal shows the exact reason.
- Then: BAF catalog exchange with "Вивантаження товарів" on, pictures off,
  only changes on; import nomenclature and clients; pilot with clients.
- Later: own domain, possibly move off Vercel, rotate the OpenRouter key,
  remove demo accounts. Voice ordering on a real iPhone still unverified.
