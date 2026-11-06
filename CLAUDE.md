# CLAUDE.md — ios (public frontend)

The plan and task list live in the private sibling repo: `../ios-admin/PLAN.md` and `../ios-admin/docs/TASKS.md`.
Read them first and follow the execution protocol in `../ios-admin/CLAUDE.md`.

## Rules for this repo
- PUBLIC repo: never commit secrets, real student data, real index numbers or emails.
  Placeholders only: `COBSCCOMP251P-0NN`, `student0NN@example.edu`.
- Only the Supabase **publishable** key may appear in frontend config. Never the secret key.
- Security is enforced by Supabase RLS and server-side checks, never by hiding UI.
- Hash routing (`/#/...`) — GitHub Pages has no SPA rewrites.
- Timezone: Asia/Colombo for all displayed times.
- Never write to the LMS.
