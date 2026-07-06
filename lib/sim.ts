"use client";

// ─────────────────────────────────────────────────────────────
// Switchboard simulation engine.
// Drives the demo: concurrent calls stream word-by-word through
// scripted conversations, sentiment evolves per turn, ended calls
// receive AI QA scorecards — mimicking the production path
// (Retell webhooks → Supabase Realtime → console).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

export type Speaker = "ai" | "caller";
export type CallStatus = "live" | "wrapping" | "done";
export type Outcome = "booked" | "resolved" | "transferred" | "voicemail";

export interface Turn {
  speaker: Speaker;
  text: string;
  sentiment: number; // -1 .. 1 caller mood at this point
}

export interface QAScore {
  overall: number;
  greeting: number;
  compliance: number;
  resolution: number;
  tone: number;
  note: string;
}

export interface Call {
  id: string;
  caller: string;
  phone: string;
  location: string;
  intent: string;
  startedAt: number;
  endedAt: number | null;
  status: CallStatus;
  turns: Turn[]; // completed turns
  partial: { speaker: Speaker; text: string } | null; // streaming turn
  sentimentTrail: number[];
  outcome: Outcome | null;
  qa: QAScore | null;
  scriptIdx: number;
  turnIdx: number;
  wordIdx: number;
}

interface Script {
  caller: string;
  phone: string;
  location: string;
  intent: string;
  outcome: Outcome;
  turns: Turn[];
  qa: QAScore;
}

const LOCATIONS = [
  "Downtown", "Northside", "Riverbend", "Westgate", "Oak Park", "Southcentre",
];

const SCRIPTS: Script[] = [
  {
    caller: "Melissa Grant", phone: "(587) 555-0341", location: "Downtown",
    intent: "New patient booking", outcome: "booked",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: 0.1 },
      { speaker: "caller", text: "Hi, um, I just moved to the area and I'm looking for a new dentist. Do you take new patients?", sentiment: 0.1 },
      { speaker: "ai", text: "We absolutely do, and welcome to the neighbourhood. I can get you set up with a new patient exam and cleaning. Do you have a preferred day of the week?", sentiment: 0.3 },
      { speaker: "caller", text: "Somewhere early next week would be great, mornings if possible.", sentiment: 0.4 },
      { speaker: "ai", text: "Let me check the Downtown schedule. I have Tuesday at 9:10 AM with Dr. Osei, or Wednesday at 8:30 AM with Dr. Lam. Which works better?", sentiment: 0.4 },
      { speaker: "caller", text: "Tuesday at 9:10 is perfect.", sentiment: 0.6 },
      { speaker: "ai", text: "Wonderful. I have you booked Tuesday 9:10 AM with Dr. Osei. I'm texting you a confirmation with our intake form now — plan for about ninety minutes for the first visit. Anything else I can help with?", sentiment: 0.7 },
      { speaker: "caller", text: "No, that's everything. That was really easy, thank you!", sentiment: 0.8 },
    ],
    qa: { overall: 96, greeting: 100, compliance: 95, resolution: 100, tone: 90, note: "Textbook new-patient flow. Offered two concrete slots, confirmed provider, set duration expectations, and triggered intake SMS. No compliance gaps." },
  },
  {
    caller: "Raymond Fenwick", phone: "(403) 555-0288", location: "Westgate",
    intent: "Billing dispute", outcome: "transferred",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: -0.2 },
      { speaker: "caller", text: "Yeah, I got a bill for two hundred and forty dollars and I was told my insurance covered the whole cleaning. This is the second time this has happened.", sentiment: -0.6 },
      { speaker: "ai", text: "I'm sorry, Raymond — twice is frustrating, and I want to get this looked at properly. I can see your visit on June 18th at Westgate. May I confirm the last four digits of the card on file before we discuss the account?", sentiment: -0.5 },
      { speaker: "caller", text: "It ends in 7 7 3 2.", sentiment: -0.4 },
      { speaker: "ai", text: "Thank you. I can see the claim was submitted with a code your plan flags for review, which is likely the issue rather than a real balance. Billing disputes need a human specialist — I'm transferring you to Priya on our billing team right now, and I've attached the claim details so you won't have to repeat any of this.", sentiment: -0.2 },
      { speaker: "caller", text: "Okay. As long as I don't have to explain it all over again.", sentiment: -0.1 },
      { speaker: "ai", text: "You won't. Transferring you now — one moment.", sentiment: 0.0 },
    ],
    qa: { overall: 88, greeting: 100, compliance: 100, resolution: 70, tone: 95, note: "Correct escalation path with identity verification before account discussion. Warm-transfer context attached. Resolution scored lower only because the issue required human handoff by policy." },
  },
  {
    caller: "Janet Okonkwo", phone: "(587) 555-0195", location: "Riverbend",
    intent: "Emergency — severe pain", outcome: "booked",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: -0.5 },
      { speaker: "caller", text: "My son cracked a molar at hockey practice and he's in a lot of pain. Can anyone see him today? Please?", sentiment: -0.8 },
      { speaker: "ai", text: "I'm so sorry — we'll get him seen today. Riverbend holds emergency slots every afternoon. Is there any bleeding that won't stop, swelling around the eye, or difficulty swallowing? Those would need urgent care instead.", sentiment: -0.7 },
      { speaker: "caller", text: "No, none of that. Just the cracked tooth and pain.", sentiment: -0.5 },
      { speaker: "ai", text: "Okay, that's one we can handle. I have an emergency slot at 2:40 PM today at Riverbend with Dr. Chen. Until then, a cold compress on the outside of the cheek can help, and keep the area clear of food. Shall I book it?", sentiment: -0.3 },
      { speaker: "caller", text: "Yes, book it. Thank you so much.", sentiment: 0.2 },
      { speaker: "ai", text: "Done — 2:40 PM today, Dr. Chen at Riverbend. I've texted you the address and what to bring. He's in good hands.", sentiment: 0.5 },
    ],
    qa: { overall: 98, greeting: 100, compliance: 100, resolution: 100, tone: 92, note: "Excellent triage: screened red-flag symptoms before booking, held urgency without alarming the caller, provided safe interim guidance, confirmed same-day emergency slot." },
  },
  {
    caller: "Derek Halvorsen", phone: "(403) 555-0422", location: "Oak Park",
    intent: "Reschedule appointment", outcome: "resolved",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: 0.0 },
      { speaker: "caller", text: "I've got a cleaning on Thursday at Oak Park but something came up at work. Can I move it?", sentiment: -0.1 },
      { speaker: "ai", text: "No problem, Derek. I see Thursday 3:00 PM with Dr. Marsh. The next openings are Friday at 11:20 AM or Monday at 4:15 PM — do either of those work?", sentiment: 0.1 },
      { speaker: "caller", text: "Monday at 4:15 works.", sentiment: 0.3 },
      { speaker: "ai", text: "You're moved to Monday 4:15 PM with Dr. Marsh at Oak Park, and Thursday is released. Updated confirmation is on its way to your phone. Anything else?", sentiment: 0.5 },
      { speaker: "caller", text: "Nope, that's it. Cheers.", sentiment: 0.6 },
    ],
    qa: { overall: 94, greeting: 100, compliance: 90, resolution: 100, tone: 88, note: "Fast, clean reschedule with two alternatives offered immediately. Minor: did not confirm callback number for the SMS confirmation." },
  },
  {
    caller: "Sophie Tremblay", phone: "(587) 555-0117", location: "Northside",
    intent: "Insurance coverage question", outcome: "resolved",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: 0.0 },
      { speaker: "caller", text: "Hi, I'm thinking about getting Invisalign and I want to know if my Sun Life plan covers any of it.", sentiment: 0.1 },
      { speaker: "ai", text: "Great question. Most Sun Life plans cover orthodontics at fifty percent up to a lifetime maximum, but the exact numbers depend on your specific plan. I can have our treatment coordinator run a free benefits check with your policy number — it takes about a day. Want me to set that up?", sentiment: 0.2 },
      { speaker: "caller", text: "Yes please. Do I give you the policy number now?", sentiment: 0.3 },
      { speaker: "ai", text: "You can — I'll note it securely on your file for the coordinator. Go ahead whenever you're ready.", sentiment: 0.3 },
      { speaker: "caller", text: "It's 8 8 4 5 1 2 9 9 0.", sentiment: 0.3 },
      { speaker: "ai", text: "Got it. Amara will call you tomorrow with your exact Invisalign coverage and payment options. Anything else today?", sentiment: 0.5 },
      { speaker: "caller", text: "That's perfect, thanks!", sentiment: 0.7 },
    ],
    qa: { overall: 91, greeting: 100, compliance: 85, resolution: 95, tone: 95, note: "Set accurate expectations without overpromising coverage. Compliance note: policy number was accepted verbally — flow should offer the secure SMS link first per data-handling guideline." },
  },
  {
    caller: "Marcus Webb", phone: "(403) 555-0366", location: "Southcentre",
    intent: "After-hours voicemail", outcome: "voicemail",
    turns: [
      { speaker: "ai", text: "Thank you for calling BrightSmile Dental, this is Ava. How can I help you today?", sentiment: 0.0 },
      { speaker: "caller", text: "Hey, I was told to call about picking up my night guard? Is it ready?", sentiment: 0.1 },
      { speaker: "ai", text: "Let me check that for you, Marcus. Your night guard arrived at Southcentre this morning and is ready for pickup any time during clinic hours — we're open until 6 PM today.", sentiment: 0.3 },
      { speaker: "caller", text: "Awesome, I'll swing by after work. Do I need an appointment for that?", sentiment: 0.5 },
      { speaker: "ai", text: "No appointment needed for pickup, though the assistant will do a two-minute fit check when you arrive. See you this afternoon!", sentiment: 0.6 },
    ],
    qa: { overall: 93, greeting: 100, compliance: 95, resolution: 95, tone: 90, note: "Lab-case lookup handled correctly with hours and fit-check expectation set. Outcome auto-tagged from CRM pickup confirmation." },
  },
];

// ── Deterministic analytics data ─────────────────────────────
export const HOURLY_HEATMAP: number[][] = [
  // 7 days x 12 hours (8am–8pm), calls handled
  [4, 9, 12, 14, 11, 8, 10, 13, 12, 9, 6, 3],
  [5, 11, 14, 16, 12, 9, 11, 15, 13, 10, 7, 3],
  [4, 10, 13, 15, 13, 10, 12, 14, 12, 9, 6, 2],
  [6, 12, 15, 17, 14, 10, 13, 16, 14, 11, 7, 4],
  [7, 13, 16, 18, 15, 12, 14, 17, 15, 12, 8, 4],
  [8, 10, 12, 11, 9, 7, 8, 9, 7, 5, 3, 1],
  [2, 4, 6, 7, 6, 5, 5, 6, 4, 3, 2, 1],
];
export const WEEK_KPIS = {
  totalCalls: 847,
  containment: 0.84, // resolved without human transfer
  avgHandleSec: 142,
  bookings: 312,
  afterHoursShare: 0.31,
  avgQA: 93,
};

let seq = 0;
const uid = () => `call_${Date.now().toString(36)}_${++seq}`;

function newCall(scriptIdx: number, preload = 0): Call {
  const s = SCRIPTS[scriptIdx % SCRIPTS.length];
  const call: Call = {
    id: uid(),
    caller: s.caller,
    phone: s.phone,
    location: s.location,
    intent: s.intent,
    startedAt: Date.now() - preload * 1000,
    endedAt: null,
    status: "live",
    turns: [],
    partial: null,
    sentimentTrail: [],
    outcome: null,
    qa: null,
    scriptIdx: scriptIdx % SCRIPTS.length,
    turnIdx: 0,
    wordIdx: 0,
  };
  return call;
}

/** Advance a live call by a few streamed words. Pure function on a draft copy. */
function tick(call: Call): Call {
  if (call.status !== "live") return call;
  const script = SCRIPTS[call.scriptIdx];
  const turn = script.turns[call.turnIdx];

  if (!turn) {
    // Script finished → wrap up
    return { ...call, status: "wrapping", partial: null };
  }

  const words = turn.text.split(" ");
  const step = 2 + Math.floor(Math.random() * 3); // 2-4 words per tick
  const nextWord = Math.min(words.length, call.wordIdx + step);
  const partialText = words.slice(0, nextWord).join(" ");

  if (nextWord >= words.length) {
    // Turn complete
    return {
      ...call,
      turns: [...call.turns, turn],
      sentimentTrail: [...call.sentimentTrail, turn.sentiment],
      partial: null,
      turnIdx: call.turnIdx + 1,
      wordIdx: 0,
    };
  }
  return { ...call, partial: { speaker: turn.speaker, text: partialText }, wordIdx: nextWord };
}

function finalize(call: Call): Call {
  const script = SCRIPTS[call.scriptIdx];
  return {
    ...call,
    status: "done",
    endedAt: Date.now(),
    outcome: script.outcome,
    qa: script.qa,
  };
}

const MAX_LIVE = 4;
const TICK_MS = 420;
const WRAP_MS = 2200;
const SPAWN_MS = 14000;

export function useSwitchboard() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [ready, setReady] = useState(false);
  const [, setClock] = useState(0); // forces duration re-render
  const nextScript = useRef(3);

  useEffect(() => {
    // Seed: three calls in progress at different depths, one completed
    const c1 = { ...newCall(0, 38) };
    for (let i = 0; i < 26; i++) Object.assign(c1, tick(c1));
    const c2 = { ...newCall(1, 21) };
    for (let i = 0; i < 12; i++) Object.assign(c2, tick(c2));
    const c3 = { ...newCall(2, 6) };
    for (let i = 0; i < 4; i++) Object.assign(c3, tick(c3));
    let done = newCall(3, 240);
    for (let i = 0; i < 500 && done.status === "live"; i++) done = tick(done);
    done = finalize(done);
    done.endedAt = Date.now() - 130_000;

    setCalls([c1 as Call, c2 as Call, c3 as Call, done]);
    setReady(true);

    const streamLoop = setInterval(() => {
      setCalls((prev) =>
        prev.map((c) => (c.status === "live" ? tick(c) : c))
      );
    }, TICK_MS);

    const wrapLoop = setInterval(() => {
      setCalls((prev) =>
        prev.map((c) => (c.status === "wrapping" ? finalize(c) : c))
      );
    }, WRAP_MS);

    const spawnLoop = setInterval(() => {
      setCalls((prev) => {
        const live = prev.filter((c) => c.status !== "done").length;
        if (live >= MAX_LIVE) return prev;
        const idx = nextScript.current++;
        return [newCall(idx), ...prev];
      });
    }, SPAWN_MS);

    const clockLoop = setInterval(() => setClock((t) => t + 1), 1000);

    return () => {
      clearInterval(streamLoop);
      clearInterval(wrapLoop);
      clearInterval(spawnLoop);
      clearInterval(clockLoop);
    };
  }, []);

  const supervisorAction = (callId: string, action: "whisper" | "barge" | "end") => {
    setCalls((prev) =>
      prev.map((c) => {
        if (c.id !== callId) return c;
        const note: Turn = {
          speaker: "ai",
          text:
            action === "whisper"
              ? "[Supervisor whisper delivered to agent — caller cannot hear]"
              : action === "barge"
              ? "[Supervisor joined the call — three-way bridge active]"
              : "[Call ended by supervisor]",
          sentiment: c.sentimentTrail[c.sentimentTrail.length - 1] ?? 0,
        };
        if (action === "end") return finalize({ ...c, turns: [...c.turns, note] });
        return { ...c, turns: [...c.turns, note] };
      })
    );
  };

  return { calls, ready, supervisorAction };
}

export function fmtDuration(call: Call): string {
  const end = call.endedAt ?? Date.now();
  const s = Math.max(0, Math.floor((end - call.startedAt) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function sentimentLabel(v: number): { label: string; cls: string } {
  if (v > 0.25) return { label: "positive", cls: "pos" };
  if (v < -0.25) return { label: "negative", cls: "neg" };
  return { label: "neutral", cls: "neu" };
}
