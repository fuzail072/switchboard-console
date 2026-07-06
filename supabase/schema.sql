-- ─────────────────────────────────────────────────────────────
-- Switchboard — Supabase schema
-- ─────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists public.calls (
  id              uuid primary key default gen_random_uuid(),
  retell_call_id  text unique,
  created_at      timestamptz not null default now(),
  started_at      timestamptz,
  ended_at        timestamptz,
  caller_name     text,
  caller_number   text,
  location        text,
  intent          text,
  status          text not null default 'live' check (status in ('live','wrapping','done')),
  outcome         text check (outcome in ('booked','resolved','transferred','voicemail')),
  sentiment       text,
  summary         text,
  transcript      text,
  recording_url   text
);

create table if not exists public.transcript_turns (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid not null references public.calls(id) on delete cascade,
  created_at timestamptz not null default now(),
  speaker    text not null check (speaker in ('ai','caller')),
  text       text not null,
  sentiment  numeric(3,2)
);

create table if not exists public.qa_scores (
  id         uuid primary key default gen_random_uuid(),
  call_id    uuid not null unique references public.calls(id) on delete cascade,
  created_at timestamptz not null default now(),
  overall    int check (overall between 0 and 100),
  greeting   int,
  compliance int,
  resolution int,
  tone       int,
  note       text
);

create index if not exists calls_status_idx on public.calls (status, started_at desc);
create index if not exists turns_call_idx on public.transcript_turns (call_id, created_at);

alter table public.calls enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.qa_scores enable row level security;

create policy "Authenticated read calls"  on public.calls            for select to authenticated using (true);
create policy "Authenticated read turns"  on public.transcript_turns for select to authenticated using (true);
create policy "Authenticated read qa"     on public.qa_scores        for select to authenticated using (true);
-- Writes come only from the webhook route / n8n via service_role (bypasses RLS).

alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.transcript_turns;
alter publication supabase_realtime add table public.qa_scores;
