# ios

Student and instructor web app for the NIBM iOS Application Development module (BSCCOMP25.1P).
Hosted on GitHub Pages at https://ios.xoxnxox.com. Backend: Supabase.

This repo is **public**. It holds frontend code only — no secrets, no student data.
The plan, database schema, Edge Functions and the lab Mac helper live in the private `ios-admin` repo.

## Setup
1. `cp .env.example .env.local` (default `VITE_API=mock` needs no backend; for `supabase` fill in the URL + publishable key).
2. `npm install && npm run dev` (http://localhost:5173, hash routes `/#/...`).

## Commands
| Command | What |
|---|---|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` / `npm run preview` | Production build / serve it |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest (jsdom) |
| `npm run lint` | ESLint (supabase-js allowed only in `src/api/supabase/`) |
| `npm run e2e` | Playwright (Chromium; `npx playwright install chromium` once) |

## CI and deploy
`.github/workflows/ci.yml` runs on every push/PR (and manually):
- `check`: `npm ci`, typecheck, test, lint, build (`VITE_API=mock`, `VITE_COMMIT_SHA` = commit).
- `e2e`: Playwright (Chromium, mock adapter); the report is uploaded on failure.
- `deploy`: on push to `main` only, after `check` and `e2e`, builds `dist/` and publishes it with GitHub Pages (Actions). `public/CNAME` and `public/lms-test.html` are copied into `dist/`, so `https://ios.xoxnxox.com/lms-test.html` keeps working.

The production build uses `VITE_API=mock` for now. When the Supabase adapter is switched on, add the **publishable** URL and key as repo *variables* (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`) and pass them in the workflow. Never use the secret key or repo secrets for the frontend build.

`/#/health` shows app name, commit, build time (Asia/Colombo) and active adapter.

> **Fuzail: set Settings → Pages → Source = GitHub Actions before merging/pushing this**, otherwise the legacy branch deploy serves raw source.
