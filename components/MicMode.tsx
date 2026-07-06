"use client";

// ─────────────────────────────────────────────────────────────
// Live Mic mode — full voice agent loop on YOUR voice:
//   1. Web Speech API streams your words (STT)
//   2. /api/agent generates Ava's reply (GPT-4o-mini if
//      OPENAI_API_KEY is set, built-in demo brain otherwise)
//   3. speechSynthesis speaks the reply aloud (TTS)
// The mic is paused while Ava speaks so she doesn't hear and
// transcribe herself (feedback-loop protection).
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";

interface ChatTurn {
  role: "user" | "assistant";
  text: string;
  at: number;
}

const SEND_DEBOUNCE_MS = 900;

export default function MicMode() {
  const [supported, setSupported] = useState(true);
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const keepAlive = useRef(false);
  const muted = useRef(false); // true while Ava is speaking
  const pendingText = useRef("");
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const turnsRef = useRef<ChatTurn[]>([]);
  const voiceOnRef = useRef(true);

  useEffect(() => { turnsRef.current = turns; }, [turns]);
  useEffect(() => { voiceOnRef.current = voiceOn; }, [voiceOn]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) setSupported(false);
    return () => stopAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, interim, thinking]);

  function drawWave(analyser: AnalyserNode) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = (canvas.width = canvas.offsetWidth * 2);
    const H = 120;
    canvas.height = H;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const bars = 64;

    const loop = () => {
      analyser.getByteFrequencyData(data);
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = muted.current ? "#4ade80" : "#22d3ee";
      const chunk = Math.floor(data.length / bars);
      for (let i = 0; i < bars; i++) {
        let sum = 0;
        for (let j = 0; j < chunk; j++) sum += data[i * chunk + j];
        const v = muted.current ? 0.03 : sum / chunk / 255;
        const h = Math.max(4, v * H * 1.6);
        ctx.globalAlpha = 0.9;
        ctx.fillRect((i / bars) * W, (H - h) / 2, W / bars - 3, Math.min(h, H - 4));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  }

  function speak(text: string, onDone: () => void) {
    if (!voiceOnRef.current || !("speechSynthesis" in window)) {
      onDone();
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.03;
    u.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /Google US English|Samantha|Microsoft (Aria|Jenny)/i.test(v.name)) ||
      voices.find((v) => v.lang.startsWith("en"));
    if (preferred) u.voice = preferred;
    u.onend = onDone;
    u.onerror = onDone;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  async function sendToAgent() {
    const text = pendingText.current.trim();
    pendingText.current = "";
    if (!text) return;

    const userTurn: ChatTurn = { role: "user", text, at: Date.now() };
    setTurns((prev) => [...prev, userTurn]);
    setThinking(true);

    // Mute STT while waiting + speaking, so Ava doesn't hear herself.
    muted.current = true;
    try { recRef.current?.stop(); } catch {}

    let reply = "Sorry, I had trouble responding just now — could you say that again?";
    try {
      const history = [...turnsRef.current, userTurn].map((t) => ({
        role: t.role,
        content: t.text,
      }));
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (data.reply) reply = data.reply;
    } catch {
      /* keep fallback reply */
    }

    setThinking(false);
    setTurns((prev) => [...prev, { role: "assistant", text: reply, at: Date.now() }]);
    setSpeaking(true);

    speak(reply, () => {
      setSpeaking(false);
      muted.current = false;
      // Resume listening after Ava finishes.
      if (keepAlive.current) {
        try { recRef.current?.start(); } catch {}
      }
    });
  }

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.75;
      source.connect(analyser);
      drawWave(analyser);

      // Pre-warm the TTS voice list (Chrome loads voices lazily).
      if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onresult = (e: any) => {
        if (muted.current) return;
        let interimText = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) {
            const text = r[0].transcript.trim();
            if (text) {
              pendingText.current = (pendingText.current + " " + text).trim();
              if (sendTimer.current) clearTimeout(sendTimer.current);
              sendTimer.current = setTimeout(sendToAgent, SEND_DEBOUNCE_MS);
            }
          } else {
            interimText += r[0].transcript;
          }
        }
        setInterim(interimText);
        if (interimText && sendTimer.current) {
          // Still talking — hold the send.
          clearTimeout(sendTimer.current);
          sendTimer.current = setTimeout(sendToAgent, SEND_DEBOUNCE_MS);
        }
      };

      rec.onerror = (e: any) => {
        if (e.error === "not-allowed") {
          setError("Microphone permission denied. Allow mic access and try again.");
          stopAll();
        }
      };

      rec.onend = () => {
        if (keepAlive.current && !muted.current) {
          try { rec.start(); } catch {}
        }
      };

      keepAlive.current = true;
      muted.current = false;
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err: any) {
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone permission denied. Allow mic access and try again."
          : "Could not access the microphone."
      );
    }
  }

  function stopAll() {
    keepAlive.current = false;
    muted.current = false;
    if (sendTimer.current) clearTimeout(sendTimer.current);
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    cancelAnimationFrame(rafRef.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && canvasRef.current) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    setListening(false);
    setSpeaking(false);
    setThinking(false);
    setInterim("");
  }

  if (!supported) {
    return (
      <div className="mic-wrap">
        <div className="mic-unsupported">
          This browser does not expose the Web Speech API. Open the console in <b>Chrome</b> or <b>Edge</b> to talk to Ava — or wire a streaming STT provider (Deepgram / OpenAI Realtime) for cross-browser support.
        </div>
      </div>
    );
  }

  const statusLine = !listening
    ? "Talk to Ava — she listens, thinks, and answers out loud"
    : speaking
    ? "AVA IS SPEAKING · mic paused"
    : thinking
    ? "AVA IS THINKING…"
    : "LISTENING · speak naturally, pause to send";

  return (
    <div className="mic-wrap">
      <div className="mic-stage">
        <div className="mic-head">
          <div>
            <div className="det-name">Talk to Ava</div>
            <div className="det-sub">{statusLine}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="mic-btn" onClick={() => setVoiceOn((v) => !v)} title="Toggle spoken replies">
              {voiceOn ? "🔊 Voice on" : "🔇 Voice off"}
            </button>
            {listening ? (
              <button className="mic-btn stop" onClick={stopAll}>■ Stop</button>
            ) : (
              <button className="mic-btn" onClick={start}>● Start talking</button>
            )}
          </div>
        </div>

        {error && <div className="mic-error">{error}</div>}

        <canvas ref={canvasRef} className="mic-wave" />

        <div className="transcript mic-transcript" ref={scrollRef}>
          {turns.length === 0 && !interim && (
            <div className="mic-hint">
              {listening
                ? 'Say something like "Hi, can I book a cleaning for next week?"'
                : "Press Start talking, allow the microphone, and have a conversation."}
            </div>
          )}
          {turns.map((t, i) => (
            <div className={`turn ${t.role === "assistant" ? "ai" : "caller"}`} key={i}>
              <div className={`turn-spk ${t.role === "assistant" ? "ai" : "caller"}`}>
                {t.role === "assistant" ? "Ava · AI agent" : "You"} ·{" "}
                {new Date(t.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}
              </div>
              <div className="turn-txt">{t.text}</div>
            </div>
          ))}
          {interim && (
            <div className="turn caller">
              <div className="turn-spk caller">You · speaking…</div>
              <div className="turn-txt">
                {interim}
                <span className="caret" />
              </div>
            </div>
          )}
          {thinking && (
            <div className="turn ai">
              <div className="turn-spk ai">Ava · AI agent</div>
              <div className="turn-txt">
                <span className="caret" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
