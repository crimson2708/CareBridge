# CareBridge — frontend

React 19 + TypeScript + Vite, wrapped in Tauri v2 for the desktop/iOS shell.
Talks to the FastAPI backend in [`../backend`](../backend) and to Supabase Auth
for sign-in.

## Setup

```shell
cp .env.example .env   # then fill in the values
npm install            # or: bun install
```

`.env` needs:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | FastAPI backend, default `http://localhost:8000` |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key **only** — never the secret key |

## Run

```shell
npm run dev      # web, on http://localhost:1420
npm run tauri dev  # desktop shell
npm run build    # typecheck + production build
```

The backend must be running for anything past the login screen to load.

## Structure

- `src/router.tsx` — hash router; everything except `/login` sits behind `RequireAuth`.
- `src/state/AuthContext.tsx` — Supabase session, staff profile, active shift.
- `src/api/client.ts` — the single axios instance; an interceptor attaches the
  access token, so no screen ever sends a nurse id of its own.
- `src/App.css` — the whole design system (single-hue green, glass panels).
  There is no Tailwind config file: v4 reads the theme from this CSS.

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) +
[Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) +
[rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
