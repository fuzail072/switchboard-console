"use client";

import { useEffect, useRef, useState } from "react";
import {
  useSwitchboard, fmtDuration, sentimentLabel,
  Call, HOURLY_HEATMAP, WEEK_KPIS,
} from "@/lib/sim";
import MicMode from "./MicMode";

// ── Animated waveform (canvas) ───────────────────────────────
function Waveform({ active, sentiment }: { active: boolean; sentiment: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = (canvas.height = 68);
    let raf = 0;
    let t = 0;
    const bars = 42;

    const draw = () => {
      t += 1;
      ctx.clearRect(0, 0, W, H);
      const color = sentiment < -0.25 ? "#f87171" : sentiment > 0.25 ? "#4ade80" : "#22d3ee";
      ctx.fillStyle = color;
      for (let i = 0; i < bars; i++) {
        const x = (i / bars) * W;
        const base = active
          ? Math.abs(Math.sin(i * 0.9 + t * 0.14)) * Math.abs(Math.sin(i * 0.31 + t * 0.05))
          : 0.06;
        const jitter = active ? Math.random() * 0.25 : 0;
        const h = Math.max(3, (base + jitter) * H * 0.8);
        ctx.globalAlpha = 0.85;
        ctx.fillRect(x, (H - h) / 2, W / bars - 3, h);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [active, sentiment]);
  return <canvas ref={ref} className="wave" />;
}

// ── Sentiment trail sparkline ────────────────────────────────
function SentimentTrail({ trail }: { trail: number[] }) {
  const w = 420, h = 46, pad = 6;
  const pts = trail.length > 1 ? trail : [0, ...trail];
  const step = (w - pad * 2) / Math.max(1, pts.length - 1);
  const y = (v: number) => h / 2 - v * (h / 2 - pad);
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${pad + i * step},${y(v)}`).join(" ");
  const last = pts[pts.length - 1] ?? 0;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sent-svg" aria-label="Caller sentiment over the call">
      <line x1={pad} x2={w - pad} y1={h / 2} y2={h / 2} stroke="rgba(226,232,240,0.1)" strokeDasharray="2 4" />
      <path d={path} fill="none" stroke={last < -0.25 ? "#f87171" : last > 0.25 ? "#4ade80" : "#fbbf24"} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={pad + (pts.length - 1) * step} cy={y(last)} r="3.5" fill={last < -0.25 ? "#f87171" : last > 0.25 ? "#4ade80" : "#fbbf24"} />
    </svg>
  );
}

// ── Live call card ───────────────────────────────────────────
function CallCard({ call, selected, onClick }: { call: Call; selected: boolean; onClick: () => void }) {
  const s = call.sentimentTrail[call.sentimentTrail.length - 1] ?? 0;
  const lastTurn = call.partial ?? call.turns[call.turns.length - 1] ?? null;
  return (
    <article
      className={`call-card ${selected ? "sel" : ""} ${call.turns.length < 2 ? "entering" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
    >
      <div className="cc-top">
        <span className={`sent-dot ${sentimentLabel(s).cls}`} title={`Sentiment: ${sentimentLabel(s).label}`} />
        <span className="cc-name">{call.caller}</span>
        <span className="cc-dur">{fmtDuration(call)}</span>
      </div>
      <div className="cc-meta">
        <b>{call.location}</b> · {call.intent} · {call.phone}
      </div>
      <Waveform active={call.status === "live"} sentiment={s} />
      <div className="cc-last">
        {lastTurn && (
          <>
            <span className="spk">{lastTurn.speaker === "ai" ? "AVA" : "CALLER"}</span>
            {lastTurn.text}
          </>
        )}
      </div>
    </article>
  );
}

// ── Detail panel ─────────────────────────────────────────────
function Detail({ call, onAction }: { call: Call; onAction: (id: string, a: "whisper" | "barge" | "end") => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [call.turns.length, call.partial?.text]);

  return (
    <aside className="detail">
      <div className="det-head">
        <div className="det-name">{call.caller}</div>
        <div className="det-sub">
          {call.phone} · {call.location} · {call.intent} · {call.status === "done" ? "ended" : fmtDuration(call)}
        </div>
      </div>

      <div className="sent-strip">
        <SentimentTrail trail={call.sentimentTrail} />
      </div>

      {call.status !== "done" && (
        <div className="sup-row">
          <button className="sup-btn" onClick={() => onAction(call.id, "whisper")}>Whisper to agent</button>
          <button className="sup-btn" onClick={() => onAction(call.id, "barge")}>Barge in</button>
          <button className="sup-btn danger" onClick={() => onAction(call.id, "end")}>End call</button>
        </div>
      )}

      <div className="transcript" ref={scrollRef}>
        {call.turns.map((t, i) => (
          <div className={`turn ${t.speaker}`} key={i}>
            <div className={`turn-spk ${t.speaker}`}>{t.speaker === "ai" ? "Ava · AI agent" : "Caller"}</div>
            <div className="turn-txt">{t.text}</div>
          </div>
        ))}
        {call.partial && (
          <div className={`turn ${call.partial.speaker}`}>
            <div className={`turn-spk ${call.partial.speaker}`}>
              {call.partial.speaker === "ai" ? "Ava · AI agent" : "Caller"}
            </div>
            <div className="turn-txt">
              {call.partial.text}
              <span className="caret" />
            </div>
          </div>
        )}
      </div>

      {call.qa && (
        <div className="qa-box">
          <div className="qa-overall">
            <span className="qa-num">{call.qa.overall}</span>
            <span style={{ fontSize: 12, color: "var(--text-faint)", fontFamily: "var(--mono)" }}>
              AI QA SCORE · {call.outcome?.toUpperCase()}
            </span>
          </div>
          <div className="qa-bars">
            {(["greeting", "compliance", "resolution", "tone"] as const).map((k) => (
              <div key={k}>
                <div className="qa-bar-l">
                  <span>{k}</span>
                  <b>{call.qa![k]}</b>
                </div>
                <div className="qa-track">
                  <div className="qa-fill" style={{ width: `${call.qa![k]}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="qa-note">{call.qa.note}</div>
        </div>
      )}
    </aside>
  );
}

// ── Analytics view ───────────────────────────────────────────
function Analytics() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cell = 34, gap = 5, lx = 44, ty = 26;
  const w = lx + 12 * (cell + gap);
  const h = ty + 7 * (cell + gap);
  const max = Math.max(...HOURLY_HEATMAP.flat());

  const k = WEEK_KPIS;
  const r = 62, cx = 90, cy = 90, circ = 2 * Math.PI * r;

  return (
    <div className="analytics">
      <div className="section-t">This week · fleet performance</div>
      <div className="ana-grid">
        <div className="panel-c">
          <h3>Call volume heatmap</h3>
          <p className="sub">Calls handled by hour (8 AM – 8 PM) across all six locations. Darker = busier.</p>
          <svg viewBox={`0 0 ${w} ${h}`} className="heat-svg" role="img" aria-label="Call volume by day and hour">
            {Array.from({ length: 12 }).map((_, hI) => (
              <text key={hI} className="heat-label" x={lx + hI * (cell + gap) + cell / 2} y={14} textAnchor="middle">
                {8 + hI}
              </text>
            ))}
            {HOURLY_HEATMAP.map((row, dI) => (
              <g key={dI}>
                <text className="heat-label" x={lx - 10} y={ty + dI * (cell + gap) + cell / 2 + 3} textAnchor="end">
                  {days[dI]}
                </text>
                {row.map((v, hI) => (
                  <rect
                    key={hI}
                    x={lx + hI * (cell + gap)}
                    y={ty + dI * (cell + gap)}
                    width={cell}
                    height={cell}
                    rx={5}
                    fill={`rgba(34, 211, 238, ${0.06 + (v / max) * 0.72})`}
                  />
                ))}
              </g>
            ))}
          </svg>
        </div>

        <div className="panel-c">
          <h3>AI containment</h3>
          <p className="sub">Share of calls fully handled without a human transfer.</p>
          <svg viewBox="0 0 180 180" className="don-svg" style={{ maxWidth: 190, margin: "0 auto" }} role="img" aria-label="AI containment rate">
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(226,232,240,0.08)" strokeWidth="14" />
            <circle
              cx={cx} cy={cy} r={r} fill="none" stroke="#22d3ee" strokeWidth="14" strokeLinecap="round"
              strokeDasharray={`${circ * k.containment} ${circ}`}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
            <text x={cx} y={cy - 2} textAnchor="middle" fill="#e6ebf2" fontSize="30" fontWeight="700" fontFamily="var(--display)">
              {Math.round(k.containment * 100)}%
            </text>
            <text x={cx} y={cy + 20} textAnchor="middle" fill="#5d6b7e" fontSize="10" fontFamily="var(--mono)">
              CONTAINMENT
            </text>
          </svg>
          <div className="metric-row"><span>Calls this week</span><b>{k.totalCalls}</b></div>
          <div className="metric-row"><span>Appointments booked</span><b>{k.bookings}</b></div>
          <div className="metric-row"><span>Avg handle time</span><b>{Math.floor(k.avgHandleSec / 60)}m {k.avgHandleSec % 60}s</b></div>
          <div className="metric-row"><span>After-hours share</span><b>{Math.round(k.afterHoursShare * 100)}%</b></div>
          <div className="metric-row"><span>Avg QA score</span><b>{k.avgQA}</b></div>
        </div>
      </div>
    </div>
  );
}

// ── Console shell ────────────────────────────────────────────
export default function Console() {
  const { calls, ready, supervisorAction } = useSwitchboard();
  const [tab, setTab] = useState<"live" | "analytics" | "mic">("live");
  const [selId, setSelId] = useState<string | null>(null);

  const live = calls.filter((c) => c.status !== "done");
  const done = calls.filter((c) => c.status === "done");
  const selected = calls.find((c) => c.id === selId) ?? live[0] ?? done[0] ?? null;

  const bookedToday = done.filter((c) => c.outcome === "booked").length + 27;
  const avgQa = done.length
    ? Math.round(done.reduce((s, c) => s + (c.qa?.overall ?? 0), 0) / done.length)
    : WEEK_KPIS.avgQA;

  return (
    <div className="console">
      <header className="hdr">
        <div className="brand">
          Switch<span className="tick">board</span>
        </div>
        <div className="org">BrightSmile Dental Group · 6 locations</div>
        <nav className="hdr-tabs">
          <button className={`hdr-tab ${tab === "live" ? "on" : ""}`} onClick={() => setTab("live")}>Live floor</button>
          <button className={`hdr-tab ${tab === "mic" ? "on" : ""}`} onClick={() => setTab("mic")}>Live mic</button>
          <button className={`hdr-tab ${tab === "analytics" ? "on" : ""}`} onClick={() => setTab("analytics")}>Analytics</button>
        </nav>
        <div className="live-pill">
          <span className="live-dot" />
          {live.length} LIVE
        </div>
      </header>

      {!ready ? (
        <div className="loading">BRIDGING TO VOICE FLEET…</div>
      ) : tab === "analytics" ? (
        <Analytics />
      ) : tab === "mic" ? (
        <MicMode />
      ) : (
        <>
          <section className="kpis" aria-label="Today">
            <div className="kpi"><div className="kpi-l">Live calls</div><div className="kpi-v cy">{live.length}</div></div>
            <div className="kpi"><div className="kpi-l">Handled today</div><div className="kpi-v">{64 + done.length}</div></div>
            <div className="kpi"><div className="kpi-l">Booked today</div><div className="kpi-v gr">{bookedToday}</div></div>
            <div className="kpi"><div className="kpi-l">Avg QA score</div><div className="kpi-v">{avgQa}</div></div>
            <div className="kpi"><div className="kpi-l">Human transfers</div><div className="kpi-v">9</div></div>
          </section>

          <div className="split">
            <div className="left">
              <div className="section-t">Live calls</div>
              <div className="call-grid">
                {live.map((c) => (
                  <CallCard key={c.id} call={c} selected={selected?.id === c.id} onClick={() => setSelId(c.id)} />
                ))}
              </div>

              <div className="section-t">Recently completed</div>
              {done.map((c) => (
                <div
                  key={c.id}
                  className={`done-row ${selected?.id === c.id ? "sel" : ""}`}
                  onClick={() => setSelId(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter") setSelId(c.id); }}
                >
                  <span className="dr-name">{c.caller}</span>
                  <span className="dr-int">{c.intent} · {c.location}</span>
                  <span className={`outcome ${c.outcome}`}>{c.outcome}</span>
                  <span className={`qa-chip ${(c.qa?.overall ?? 0) >= 90 ? "hi" : "mid"}`}>QA {c.qa?.overall}</span>
                </div>
              ))}
            </div>

            {selected ? (
              <Detail call={selected} onAction={supervisorAction} />
            ) : (
              <aside className="detail">
                <div className="empty-detail">SELECT A CALL TO OPEN THE LIVE TRANSCRIPT</div>
              </aside>
            )}
          </div>
        </>
      )}

      <footer className="ftr">
        Pipeline: <b>Retell AI webhooks</b> → <b>/api/webhooks/retell</b> → <b>Supabase Realtime</b> → console · post-call QA via <b>n8n + GPT-4o</b> · demo mode simulates the full event stream
      </footer>
    </div>
  );
}
