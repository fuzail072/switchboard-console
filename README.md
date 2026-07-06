# Switchboard — Real-Time AI Voice Agent Command Console

A live operations console for a fleet of AI voice receptionists. Built for a multi-location dental group running Retell AI agents across six clinics: supervisors watch every call as it happens — streaming transcripts, live sentiment, animated audio activity — intervene with whisper/barge controls, and review AI-generated QA scorecards the moment a call ends.

Built by **Fuzail Raza** (Jenva Systems).

---

## Architecture

```
  6 clinic phone lines
         │
     Retell AI agents ──── webhook events ────▶  /api/webhooks/retell (Next.js route)
         │                (started/ended/analyzed,      │  HMAC signature verification
         │                 transcript updates)          ▼
         │                                        Supabase (Postgres)
         │                                              │  Realtime
         └── call_ended ──▶  n8n QA pipeline            ▼
                             GPT-4o rubric scoring   Console UI
                             → qa_scores table       live grid · transcripts ·
                             → Slack alert if < 80   sentiment · supervisor controls
```

## Quick start (demo mode — zero config)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no env vars, the console runs a **full simulation of the production event stream**: three calls already in progress at different depths, transcripts streaming word-by-word with a typing caret, sentiment dots shifting as caller mood changes, calls wrapping up into QA scorecards, and new calls ringing in every ~14 seconds. The supervisor buttons (whisper / barge / end) work against the simulated calls.

## What's technically interesting here

- **Concurrent streaming state machine** (`lib/sim.ts`) — each call advances independently through scripted conversations at word granularity; the same reducer shape maps 1:1 onto Supabase Realtime row updates in production.
- **Canvas waveforms** — per-call audio activity rendered with `requestAnimationFrame`, amplitude and color driven by live sentiment.
- **Auto-following transcript** — the detail panel pins to the newest token as it streams, like a call-center wallboard.
- **Webhook ingestion with HMAC verification** (`app/api/webhooks/retell/route.ts`) — timing-safe signature check, idempotent upserts keyed on `retell_call_id`.
- **AI QA pipeline** (`n8n/post-call-qa-pipeline.json`) — transcript → GPT-4o against a 4-dimension compliance rubric → `qa_scores` insert → Slack alert on scores under 80.
- **Zero chart/UI libraries** — heatmap, containment donut, and sentiment sparklines are hand-rolled SVG.

## Production mode

1. Run `supabase/schema.sql` in a fresh Supabase project (tables, RLS, realtime publication).
2. Import `n8n/post-call-qa-pipeline.json`; set env vars `OPENAI_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SLACK_QA_ALERT_WEBHOOK`.
3. Point Retell agent webhooks at `https://your-app.vercel.app/api/webhooks/retell` and set `RETELL_WEBHOOK_SECRET`.
4. Copy `.env.example` → `.env.local`, fill both server and `NEXT_PUBLIC_*` vars, deploy to Vercel.
5. Wire Supabase Auth on the console route before giving client access — RLS already restricts reads to authenticated users.

## Stack

Next.js 14 (App Router, API routes) · TypeScript · Canvas API · Supabase (Postgres, Realtime, RLS) · Retell AI webhooks · n8n · OpenAI GPT-4o · Slack

## Structure

```
app/                    layout, page, global styles
app/api/webhooks/retell webhook ingestion route (HMAC-verified)
components/Console.tsx  console UI: grid, waveforms, transcripts, QA, analytics
lib/sim.ts              demo simulation engine + shared types
n8n/                    post-call QA pipeline (importable)
supabase/               schema.sql
docs/                   portfolio copy (delete before pushing publicly)
```
