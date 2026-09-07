# Agent instructions

- Keep the `palak` branch in a working state. Don't force-push or rewrite published history.
- Frontend lives in `frontend-oceanembed/` (TanStack Start, deploys to Vercel, Root Directory = `frontend-oceanembed`). Dev server: `npm run dev` on port 8080.
- Backend is Django (`api/`, `config/`); auth is owned by Supabase. Route for cross-check: `GET /api/auth/supabase-me/`.
- Never commit `.env` files. Update the matching `.env.example` when adding env vars (root Django vars → `/.env.example`, frontend vars → `/frontend-oceanembed/.env.example`).
- Env contract: browser uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`; server routes use `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`; chat assistant uses `GEMINI_API_KEY` server-side only.
- The Gemini model for the chat assistant is `gemini-3.6-flash`. Do not "fix" it to a 2.x name — 2.5-flash is retired for this key and returns 404.
- Verify with `npx tsc --noEmit` (frontend) and `python manage.py check` (Django) before finishing tasks.
