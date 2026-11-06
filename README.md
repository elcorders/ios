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
