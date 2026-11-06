# CLAUDE.md — ios (public frontend)

Claude Code runs from the `nibm/` root — see `../CLAUDE.md`. The plan, tasks and API contract live in the private sibling repo (`ios-admin/PLAN.md`, `ios-admin/docs/TASKS.md`, `ios-admin/docs/CONTRACT.md`); follow `ios-admin/CLAUDE.md`.
Frontend code talks to the backend only through `src/api/` (mock + supabase adapters).

## Rules for this repo
- PUBLIC repo: never commit secrets, real student data, real index numbers or emails.
  Placeholders only: `COBSCCOMP251P-0NN`, `student0NN@example.edu`.
- Only the Supabase **publishable** key may appear in frontend config. Never the secret key.
- Security is enforced by Supabase RLS and server-side checks, never by hiding UI.
- Hash routing (`/#/...`) — GitHub Pages has no SPA rewrites.
- Timezone: Asia/Colombo for all displayed times.
- Never write to the LMS.
