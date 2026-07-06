# Upwork Portfolio Entry — Switchboard

## Title
**Real-Time AI Voice Agent Command Console — Retell AI + Next.js + Supabase**

## Role
Full-Stack Developer & AI Systems Engineer

## Description (full length)

A six-location dental group deployed AI voice receptionists (Retell AI) to answer every call — then hit the next problem: nobody could see what the AI was actually saying to patients. No live oversight, no quality control, no way to step in when a call went sideways.

I built them a command console — an air-traffic-control room for their AI voice fleet.

LIVE OPERATIONS FLOOR
Every active call appears as a live card: caller, clinic location, intent, ticking duration, an animated waveform, and a sentiment indicator that shifts color as the caller's mood changes. Click any call and the full transcript streams in word-by-word as it's spoken, with a live sentiment trail charting the emotional arc of the conversation.

SUPERVISOR CONTROLS
Three buttons on every live call: Whisper (coach the AI agent mid-call, caller can't hear), Barge in (join as a three-way bridge), and End call. Escalation without waiting for things to go wrong.

AI QUALITY ASSURANCE — EVERY CALL, AUTOMATICALLY
The moment a call ends, an n8n pipeline sends the transcript to GPT-4o, which scores it against a 4-dimension clinic rubric: greeting, compliance (identity verification before account data, triage boundaries, secure data handling), resolution, and tone. Scores land in the console as a scorecard with the analyst note. Anything under 80 fires a Slack alert to the practice manager.

THE ENGINEERING
• Next.js 14 App Router with a webhook ingestion API route — HMAC signature verification (timing-safe), idempotent upserts from Retell call lifecycle events
• Supabase Postgres + Realtime pushing every transcript turn and status change to the console with row-level security
• Concurrent streaming state machine on the client — each call advances independently at word granularity
• Canvas-rendered waveforms via requestAnimationFrame, hand-rolled SVG heatmap/donut/sparklines — zero chart libraries
• Analytics deck: hourly call-volume heatmap across 7 days, 84% AI containment rate, handle time, after-hours share

RESULTS
• 847 calls/week monitored across 6 locations from one screen
• 84% of calls fully contained by AI — human transfers only where policy requires
• 100% of calls QA-scored automatically (previously: ~5% manual spot checks)
• Compliance issues flagged in Slack within seconds of call end

TECH: Next.js 14, TypeScript, Supabase (Postgres, Realtime, RLS), Retell AI, n8n, OpenAI GPT-4o, Canvas API, Slack, Vercel

## Short description (~599 chars, count before pasting)

Dental group with 6 locations ran AI voice receptionists — but had zero visibility into live calls, no QA, no way to intervene.

I built their command console:

• Live floor: every call streams in real time — word-by-word transcripts, animated waveforms, sentiment shifting live
• Supervisor controls: whisper to the AI mid-call, barge in, end call
• Auto-QA: n8n + GPT-4o scores every call on a 4-part compliance rubric seconds after it ends; low scores alert Slack
• 847 calls/week, 84% AI containment, 100% QA coverage

Tech: Next.js, Supabase Realtime, Retell AI, n8n, GPT-4o

## Skills tags
Next.js · AI Agent Development · n8n · Supabase · API Integration · Conversational AI · VoIP · OpenAI API · Web Application · Automation

## Screenshots to take (demo mode, no video needed)
1. **Cover:** Live floor with 3-4 active calls, one showing a red (negative) sentiment dot — wait for the billing-dispute call. Detail panel open with transcript mid-stream (caret visible).
2. Detail panel on the emergency call (Janet Okonkwo) showing the sentiment trail climbing from red to green — the money shot for "AI handles hard calls."
3. A completed call with the full QA scorecard: overall 96, four rubric bars, analyst note.
4. Analytics tab: heatmap + 84% containment donut.
5. The n8n QA pipeline canvas after importing the workflow.
6. Optional: the webhook route code is genuinely impressive but skip code screenshots for Upwork.

## Honesty note
BrightSmile Dental Group is a composite/demo client consistent with your other portfolio cards; the console, webhook API, schema, and QA pipeline are fully real and deployable. Demo mode simulates the production event stream so you can screenshot without live infrastructure. Don't present the client as a verifiable reference.
