# Rougeau Budget

A small household budget app for two people: log spending, paychecks and account balances, see the month
against the plan, and comment on each other's entries. Statements are matched to logged entries offline
by a script, which adds anything that wasn't logged.

- `web/` — React + Vite + Tailwind front end, deployed to GitHub Pages by `.github/workflows/deploy.yml`.
- `supabase/migrations/` — Postgres schema. Every table has row-level security on with no policies.
- `supabase/functions/api/` — the only way in. Email + 6-digit PIN sign-in (bcrypt, lockout after 5
  misses), HMAC session tokens, then service-key access on the user's behalf.

This repo holds code only. No financial data, keys or personal details are committed.
