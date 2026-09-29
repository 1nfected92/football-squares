# Football Squares demo

GitHub repository: https://github.com/1nfected92/football-squares
GitHub Pages dashboard: https://1nfected92.github.io/football-squares/

This is a **test-funds-only** NFL Squares app. A dedicated Supabase project contains the 2026 NFL regular season (272 games), 12 postseason placeholders with TBD teams, nine open price-tier boards across the next three scheduled games, Auth, RLS, ledger, and atomic database functions. New player accounts receive $500 in **test funds**. A server-side Edge Function refreshes the nearest current week from ESPN when signed-in users are active; the source is unofficial and can fail.

## Verified

- TypeScript check, four core unit tests (including hundreds of payout permutations), and Vite production build pass.
- Live database transaction tests passed for sign-up funding, purchase, duplicate-square rejection, wallet reservation/over-withdrawal, rejected cashout refund, agent deposit/admin approval, duplicate-approval rejection, and pre-lock forfeit.
- A 100-purchase database test confirmed no draw before sellout, a secure digit draw on purchase #100, and exact ledger balance.
- Another live transaction verified digit permutation, duplicate draw/settlement rejection, and Q1/Q2/Q3/Final cent reconciliation on an odd-price board.

All database test records were rolled back. These sequential transaction tests **do not prove concurrent safety**. The signed-in user interface and Edge Function authenticated invocation have not been end-to-end tested.

## Local development

Node 24. Run `npm ci`, copy `.env.example` to `.env`, set the dedicated project's public URL and publishable key, then `npm run dev`. Never put a secret or service-role key in browser variables. Use `npm run typecheck`, `npm test`, and `npm run build` for local checks.

## Deployment

Push to `main`. GitHub Actions runs typecheck, tests, build, and deploys the static frontend to GitHub Pages. Configure the repository's Pages source as **GitHub Actions**. The publishable key is intentionally public; database access is enforced by Auth, explicit grants and RLS. The backend stays on Supabase, because GitHub Pages cannot run PostgreSQL/Auth services.

## Database and rules

Migrations live under `supabase/migrations`. Apply them in order to a new dedicated project. HOME digits are rows, AWAY digits are columns. A square is unique per board coordinate. The board draws cryptographically secure digits immediately upon its 100th sale. Gross Q1/Q2/Q3 slices use floor(pot/5); Final receives the exact remainder. Each slice pays a commission calculated with integer basis points. Every balance change is append-only in integer cents. Player purchases and withdrawals are atomic. Agent deposits need admin approval; withdrawals reserve funds immediately. Settlements require admin action.

The security advisor flags intentional authenticated `SECURITY DEFINER` RPCs for manual review; each checks role/ownership and sets an empty search path. `audit_events` has RLS with no read policy and no client grant. These findings should be reviewed again before production expansion.

## Auth redirect setup

In Supabase Dashboard → Authentication → URL Configuration, set **Site URL** to `https://1nfected92.github.io/football-squares/` and add the same URL to **Redirect URLs**. Email confirmation is enabled; this setting is required before claiming signup confirmation works.

## Remaining before the approved full product

- Provision an initial admin and agents through a controlled process; complete their UI flows and live browser tests.
- Add trusted unattended score sync and automatic Q1 cancellation/refunds, provider outage handling, and official checkpoint-score verification. The current sync is triggered while signed-in clients are active.
- Run true concurrent database sessions for conflicting purchases, duplicate settlement, and simultaneous withdrawals; add full role/RLS and end-to-end tests.
- Complete transaction history, statistics, quarter line score UI, full postseason rendering, and accessibility/responsive verification.
- Obtain applicable legal and operational review before any real-money activity. No real-money mode is enabled.
