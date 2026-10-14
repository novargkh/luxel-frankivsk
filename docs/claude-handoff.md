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

## Local testing
Needs a Postgres in `.env` `DATABASE_URL` (not committed; use a local DB or
a Neon branch, never the production DB for experiments). Dev server on port
3001 (NEXTAUTH_URL points there). Seed demo logins: admin@demo.local /
client@demo.local, password `password123` (local only; remove demo
accounts and the login-page hint before real clients).

## Open items (as of 13.10.2026)
- Owner installs luxel-update-22 (KPI tasks + exchange journal), then
  checks "Обмін з BAF" after a BAF run: there was a complaint that BAF
  can't connect; the journal shows the exact reason.
- Then: BAF catalog exchange with "Вивантаження товарів" on, pictures off,
  only changes on; import nomenclature and clients; pilot with clients.
- Later: own domain, possibly move off Vercel, rotate the OpenRouter key,
  remove demo accounts. Voice ordering on a real iPhone still unverified.
