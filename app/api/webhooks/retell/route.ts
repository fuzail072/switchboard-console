import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// Retell AI webhook ingestion.
// Receives call lifecycle events (call_started, call_ended,
// call_analyzed), verifies the HMAC signature, and writes to
// Supabase — Realtime then pushes updates to the console.
// ─────────────────────────────────────────────────────────────

function getAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function verifySignature(payload: string, signature: string | null): boolean {
  const secret = process.env.RETELL_WEBHOOK_SECRET;
  if (!secret) return true; // demo mode: accept unsigned
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-retell-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) {
    // No Supabase configured — acknowledge so Retell doesn't retry.
    return NextResponse.json({ ok: true, mode: "demo", received: body.event ?? "unknown" });
  }

  const call = body.call ?? {};
  switch (body.event) {
    case "call_started":
      await admin.from("calls").upsert({
        retell_call_id: call.call_id,
        caller_number: call.from_number,
        location: call.retell_llm_dynamic_variables?.location ?? "Unknown",
        status: "live",
        started_at: new Date(call.start_timestamp ?? Date.now()).toISOString(),
      }, { onConflict: "retell_call_id" });
      break;

    case "call_ended":
      await admin.from("calls").update({
        status: "done",
        ended_at: new Date(call.end_timestamp ?? Date.now()).toISOString(),
        transcript: call.transcript ?? null,
        recording_url: call.recording_url ?? null,
      }).eq("retell_call_id", call.call_id);
      break;

    case "call_analyzed":
      // Retell post-call analysis; the n8n QA workflow also PATCHes here.
      await admin.from("calls").update({
        outcome: call.call_analysis?.custom_analysis_data?.outcome ?? null,
        sentiment: call.call_analysis?.user_sentiment ?? null,
        summary: call.call_analysis?.call_summary ?? null,
      }).eq("retell_call_id", call.call_id);
      break;

    default:
      return NextResponse.json({ ok: true, ignored: body.event });
  }

  return NextResponse.json({ ok: true });
}
