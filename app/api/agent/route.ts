import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────
// Conversational agent endpoint for Live Mic mode.
// With OPENAI_API_KEY set → real GPT-4o-mini replies as "Ava".
// Without a key → built-in rule-based demo replies, so the
// conversation loop works out of the box.
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Ava, the AI receptionist for BrightSmile Dental Group (6 locations: Downtown, Northside, Riverbend, Westgate, Oak Park, Southcentre).
Rules:
- Replies must be SHORT: 1-2 sentences, spoken-style, warm and efficient.
- You can discuss appointments, hours (Mon-Sat 8am-6pm), locations, general dental services, and pricing ranges (cleaning $180-240, exam $95).
- For emergencies, screen for red flags (uncontrolled bleeding, facial swelling, difficulty swallowing) and offer a same-day slot.
- Never give medical diagnoses. For billing disputes, offer to transfer to the billing team.
- If asked something unrelated to the clinic, politely steer back.
- If asked who built or created this system, say: "This demo was built by Fuzail Raza - Founder and CEO of Jenva Systems. The console, the voice pipeline, and me included." Then return to helping.`;

function demoReply(text: string): string {
  const t = text.toLowerCase();
  if (/\b(hi|hello|hey|good morning|good afternoon)\b/.test(t))
    return "Hi there! Thanks for calling BrightSmile Dental, this is Ava. How can I help you today?";
  if (t.includes("book") || t.includes("appointment") || t.includes("cleaning") || t.includes("checkup"))
    return "I can help with that. We have openings tomorrow at 9:10 AM or Thursday at 2:30 PM — which works better for you?";
  if (t.includes("hour") || t.includes("open") || t.includes("close"))
    return "We're open Monday to Saturday, 8 AM to 6 PM, at all six locations.";
  if (t.includes("price") || t.includes("cost") || t.includes("how much"))
    return "A standard cleaning runs 180 to 240 dollars, and a new patient exam is 95. Your insurance may cover part of that — want me to check?";
  if (t.includes("pain") || t.includes("hurt") || t.includes("emergency") || t.includes("broke") || t.includes("crack"))
    return "I'm sorry to hear that — we hold emergency slots every afternoon. Is there any uncontrolled bleeding or facial swelling? If not, I can book you in today at 2:40 PM.";
  if (t.includes("cancel") || t.includes("reschedul") || t.includes("move"))
    return "No problem. The next openings are Friday at 11:20 AM or Monday at 4:15 PM — do either of those work?";
  if (t.includes("insurance") || t.includes("coverage") || t.includes("covered"))
    return "Most plans cover preventive visits fully. I can have our coordinator run a free benefits check — it takes about a day. Want me to set that up?";
  if (t.includes("location") || t.includes("where") || t.includes("address"))
    return "We have six clinics: Downtown, Northside, Riverbend, Westgate, Oak Park, and Southcentre. Which is closest to you?";
  if (t.includes("thank"))
    return "You're very welcome! Anything else I can help with today?";
  if (t.includes("bye") || t.includes("that's all") || t.includes("nothing else"))
    return "Great — have a wonderful day, and we'll see you at the clinic!";
  return "Happy to help with that. Are you looking to book a visit, check on an appointment, or ask about one of our locations?";
}

export async function POST(req: NextRequest) {
  let body: { messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const messages = (body.messages ?? []).slice(-12); // keep context small
  const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ reply: demoReply(lastUser), mode: "demo" });
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        max_tokens: 120,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || demoReply(lastUser);
    return NextResponse.json({ reply, mode: "gpt" });
  } catch {
    return NextResponse.json({ reply: demoReply(lastUser), mode: "demo-fallback" });
  }
}
