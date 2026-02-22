# Megamozg

Telegram Mini App on Next.js App Router with:

- Tailwind CSS + shadcn-style UI components
- Supabase (PostgreSQL + pgvector + RLS + Storage)
- Telegram initData server-side auth validation
- Vercel AI SDK + OpenAI-compatible endpoint (embeddings + streaming completions)

## 1) Setup

```bash
npm install
cp .env.example .env.local
```

Fill `.env.local` with real values.

Required Supabase vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only; used to bootstrap Supabase Auth users)
- `SUPABASE_STORAGE_BUCKET`

Required AI vars (OpenAI-compatible):
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL` (for Polza: `https://api.polza.ai/api/v1`)
- `OPENAI_CHAT_MODEL` (e.g. `openai/gpt-4.1-mini`)
- `OPENAI_EMBED_MODEL` (e.g. `openai/text-embedding-3-small`)
- `OPENAI_REQUEST_TIMEOUT_MS` (default: `20000`)
- `OPENAI_REQUEST_RETRIES` (default: `2`)

Rate limiting vars:
- `API_RATE_LIMIT_WINDOW_SECONDS` (default: `60`)
- `API_RATE_LIMIT_VALIDATE_MAX` (default: `20`)
- `API_RATE_LIMIT_AI_COMPLETE_MAX` (default: `20`)
- `API_RATE_LIMIT_AI_EMBED_MAX` (default: `20`)
- `API_RATE_LIMIT_STORAGE_UPLOAD_URL_MAX` (default: `20`)

## 2) Supabase migrations

Run SQL in Supabase SQL Editor in this order:

1. `supabase/migrations/202602210001_init.sql`
2. `supabase/migrations/202602210002_es256_auth_claims.sql`

This creates:

- `telegram_profiles` table
- `documents` table (`vector(1536)`)
- RLS policies based on `auth.jwt()->'user_metadata'->>'telegram_id'`
- Storage bucket `user-files` + folder-level policies
- RPC functions `insert_document` and `match_documents`

## 3) Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

In Telegram WebView, `@twa-dev/sdk` provides `initData` automatically.
In regular browser, paste raw `initData` manually for testing.

## 4) API contracts

All protected endpoints require header:

```
Authorization: tma <raw_init_data>
```

Endpoints:

- `POST /api/telegram/validate` – validates hash, ensures Supabase Auth user, upserts Telegram profile
- `POST /api/ai/embed` – writes embedding into pgvector table
- `POST /api/ai/complete` – streams completion (`application/x-ndjson`) with `meta`, `text-delta`, `done` chunks
- `GET /api/ai/memory` – list user memory notes with optional `source`/`search` filters
- `DELETE /api/ai/memory` – delete memory note by `id`
- `POST /api/storage/upload-url` – creates signed upload URL in user folder
- `POST /api/storage/verify-upload` – verifies uploaded object exists in user folder

No cookie sessions are used.
