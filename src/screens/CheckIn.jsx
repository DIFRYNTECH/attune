import { useEffect, useRef, useState } from "react";
import { LEVELS } from "../data/levels";

const MOOD_WORDS = [
  { label: "Tired", emoji: "😴" },
  { label: "Anxious", emoji: "😰" },
  { label: "Flat", emoji: "😐" },
  { label: "Tender", emoji: "🫧" },
  { label: "Irritable", emoji: "😣" },
  { label: "Okay", emoji: "🙂" },
  { label: "Steady", emoji: "🌿" },
  { label: "Hopeful", emoji: "🌤️" },
  { label: "Worn out", emoji: "🪫" },
  { label: "Restless", emoji: "⚡" },
];

function moodCategoryFromWords(words) {
  if (!words?.length) return null;

  const scoreMap = {
    "Worn out": -2,
    Tired: -1,
    Flat: -1,
    Tender: -1,
    Anxious: -1,
    Irritable: -1,
    Restless: -1,
    Okay: 0,
    Steady: 1,
    Hopeful: 2,
  };

  const scores = words
    .map((w) => scoreMap[w])
    .filter((n) => typeof n === "number");
  if (!scores.length) return null;

  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  if (avg <= -0.5) return "low";
  if (avg >= 0.5) return "good";
  return "okay";
}

function CalmParticleField() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);

  const pointerRef = useRef({ active: false, x: 0, y: 0, strength: 0 });
  const stateRef = useRef({ w: 0, h: 0, dpr: 1, particles: [], sparks: [], t: 0 });

  const spawnBurst = (x, y) => {
    const { w, h } = stateRef.current;
    if (!w || !h) return;

    const sparks = stateRef.current.sparks;
    const count = 80;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 0.6 + Math.random() * 2.8;
      const vx = Math.cos(ang) * sp;
      const vy = Math.sin(ang) * sp * 0.65;

      const hue = i % 4;
      const rgb =
        hue === 0
          ? [56, 189, 248]
          : hue === 1
            ? [79, 109, 245]
            : hue === 2
              ? [139, 92, 246]
              : [110, 231, 183];

      sparks.push({
        x,
        y,
        vx,
        vy,
        rgb,
        size: 0.9 + Math.random() * 1.8,
        life: 0,
        maxLife: 40 + Math.floor(Math.random() * 30),
      });
    }

    // cap to avoid runaway
    if (sparks.length > 900) sparks.splice(0, sparks.length - 900);
  };

  const buildParticles = (w, h) => {
    // Higher density (roughly 2x), but cap for performance.
    const base = Math.floor((w * h) / 650);
    const count = Math.max(440, Math.min(760, base));

    // Even dispersion: jittered grid sized to the target count.
    const cols = Math.max(10, Math.round(Math.sqrt((count * w) / Math.max(1, h))));
    const rows = Math.max(10, Math.ceil(count / cols));
    const cellW = w / cols;
    const cellH = h / rows;

    const particles = Array.from({ length: count }, (_, i) => {
      // deterministic pseudo-random from i (stable renders)
      const s1 = (i * 9301 + 49297) % 233280;
      const r1 = s1 / 233280;
      const s2 = (s1 * 9301 + 49297) % 233280;
      const r2 = s2 / 233280;
      const s3 = (s2 * 9301 + 49297) % 233280;
      const r3 = s3 / 233280;

      // place on a grid, with small jitter so it feels organic
      const gx = i % cols;
      const gy = Math.floor(i / cols) % rows;
      const jitterX = (r1 - 0.5) * cellW * 0.55;
      const jitterY = (r2 - 0.5) * cellH * 0.55;
      const x = (gx + 0.5) * cellW + jitterX;
      const y = (gy + 0.5) * cellH + jitterY;

      const speed = 0.05 + r3 * 0.22;
      const ang = ((i * 19) % 360) * (Math.PI / 180);
      const vx = Math.cos(ang) * speed;
      const vy = Math.sin(ang) * speed * 0.55;

      const size = 0.55 + (i % 9) * 0.16;
      const alpha = 0.18 + ((i % 13) / 13) * 0.70;

      const hue = i % 4;
      const rgb =
        hue === 0
          ? [56, 189, 248]
          : hue === 1
            ? [79, 109, 245]
            : hue === 2
              ? [139, 92, 246]
              : [110, 231, 183];

      return {
        x,
        y,
        vx,
        vy,
        size,
        alpha,
        rgb,
        phase: (i % 97) * 0.13,
      };
    });

    stateRef.current.particles = particles;
  };

  const resize = () => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    stateRef.current.w = w;
    stateRef.current.h = h;
    stateRef.current.dpr = dpr;

    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    buildParticles(w, h);
  };

  useEffect(() => {
    resize();
    const onResize = () => resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const step = () => {
      const { w, h, dpr, particles, sparks } = stateRef.current;
      stateRef.current.t += 1;
      const t = stateRef.current.t;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // subtle trails: fade the previous frame instead of hard clearing
      ctx.globalCompositeOperation = "source-over";
      // Pure white fade to keep the block looking clean.
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(0, 0, w, h);

      const pointer = pointerRef.current;
      const targetStrength = pointer.active ? 1 : 0;
      pointer.strength += (targetStrength - pointer.strength) * 0.10;

      // Immediate “higher concentration” near the press point
      if (pointer.active && (t % 4 === 0)) {
        const n = Math.min(80, particles.length);
        for (let i = 0; i < n; i++) {
          const p = particles[(t * 3 + i * 17) % particles.length];
          p.x = p.x + (pointer.x - p.x) * 0.42;
          p.y = p.y + (pointer.y - p.y) * 0.42;
          p.vx *= 0.55;
          p.vy *= 0.55;
        }
      }

      ctx.shadowBlur = 0;

      // spark burst particles (short-lived)
      ctx.globalCompositeOperation = "lighter";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += 1;
        const k = 1 - s.life / s.maxLife;
        if (k <= 0) {
          sparks.splice(i, 1);
          continue;
        }

        s.vx *= 0.985;
        s.vy *= 0.985;
        s.x += s.vx;
        s.y += s.vy;

        // slight upward lift so it feels airy
        s.vy -= 0.002;

        const a = 0.95 * k;
        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${a * 0.35})`;
        ctx.shadowColor = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${a})`;
        ctx.shadowBlur = 22;
        ctx.arc(s.x, s.y, s.size * 2.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${a})`;
        ctx.shadowColor = `rgba(255,255,255,${Math.min(0.9, a + 0.2)})`;
        ctx.shadowBlur = 14;
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Main particles: use normal blending so they stay visible on light backgrounds.
      ctx.globalCompositeOperation = "source-over";

      for (const p of particles) {
        const nx = (p.x / w) * 2 - 1;
        const ny = (p.y / h) * 2 - 1;

        // gentle curl field
        const curl =
          Math.sin(t * 0.010 + p.phase + nx * 1.7) *
          Math.cos(t * 0.008 + p.phase + ny * 1.4);

        p.vx += curl * 0.006;
        p.vy += curl * 0.004;

        // attraction on press
        if (pointer.strength > 0.001) {
          const dx = pointer.x - p.x;
          const dy = pointer.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const pull = (pointer.strength * 0.75) / Math.max(10, dist);
          p.vx += (dx / dist) * pull;
          p.vy += (dy / dist) * pull;
        }

        // friction
        p.vx *= 0.985;
        p.vy *= 0.985;

        p.x += p.vx;
        p.y += p.vy;

        // wrap around
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10;
        if (p.y > h + 10) p.y = -10;

        // twinkle
        const tw = 0.65 + 0.35 * Math.sin(t * 0.02 + p.phase);
        const a = p.alpha * tw;

        // Outer glow
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${a * 0.22})`;
        ctx.shadowColor = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${Math.min(1, a)})`;
        ctx.shadowBlur = 22;
        ctx.arc(p.x, p.y, p.size * 1.9, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${Math.min(1, a * 1.05)})`;
        ctx.shadowColor = `rgba(${p.rgb[0]},${p.rgb[1]},${p.rgb[2]},${Math.min(1, a)})`;
        ctx.shadowBlur = 14;
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Tiny white specular (helps readability on white bg)
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.75, a * 0.55)})`;
        ctx.shadowColor = `rgba(255,255,255,${Math.min(0.55, a * 0.35)})`;
        ctx.shadowBlur = 6;
        ctx.arc(p.x + 0.4, p.y - 0.4, Math.max(0.4, p.size * 0.35), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";

      raf = window.requestAnimationFrame(step);
    };

    raf = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const updatePointerFromEvent = (e) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    pointerRef.current.x = e.clientX - rect.left;
    pointerRef.current.y = e.clientY - rect.top;
  };

  return (
    <div
      ref={wrapRef}
      className="calmVisual"
      aria-hidden="true"
      onPointerDown={(e) => {
        updatePointerFromEvent(e);
        pointerRef.current.active = true;
        spawnBurst(pointerRef.current.x, pointerRef.current.y);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }}
      onPointerMove={(e) => {
        if (!pointerRef.current.active) return;
        updatePointerFromEvent(e);
      }}
      onPointerUp={() => {
        pointerRef.current.active = false;
      }}
      onPointerCancel={() => {
        pointerRef.current.active = false;
      }}
      onPointerLeave={() => {
        pointerRef.current.active = false;
      }}
    >
      <canvas ref={canvasRef} className="calmCanvas" />
    </div>
  );
}

export default function CheckIn({ state, actions }) {
  const { checkin, level, checkedInToday } = state;
  const note = (checkin.note || "").slice(0, 100);
  const noteRef = useRef(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const autosizeNote = () => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    autosizeNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note]);

  const selectedMoodWords =
    checkin.moodWords?.length
      ? checkin.moodWords
      : checkin.mood === "okay"
        ? ["Okay"]
        : [];

  const toggleMoodWord = (word) => {
    const already = selectedMoodWords.includes(word);

    let next;
    if (already) {
      next = selectedMoodWords.filter((w) => w !== word);
    } else {
      // keep it gentle: max 2 words
      next = selectedMoodWords.length >= 2
        ? [selectedMoodWords[0], word]
        : [...selectedMoodWords, word];
    }

    const mood = moodCategoryFromWords(next) || checkin.mood || "okay";
    actions.setCheckin({ moodWords: next, mood });
  };

  return (
    <div className="card checkinCard">
      <h2>🌤 How are you today?</h2>
      <div className="sub">Optional, skip-friendly, and changeable anytime.</div>

      <div className="row">
        <div>
          <label>Mood (pick up to 2)</label>
          <div className="moodGrid" role="group" aria-label="Mood">
            {MOOD_WORDS.map((w) => (
              <button
                key={w.label}
                type="button"
                className={
                  "moodBtn" + (selectedMoodWords.includes(w.label) ? " active" : "")
                }
                aria-label={w.label}
                title={w.label}
                aria-pressed={selectedMoodWords.includes(w.label)}
                onClick={() => toggleMoodWord(w.label)}
              >
                <span aria-hidden="true">{w.emoji}</span>
              </button>
            ))}
          </div>
          <div className="footerNote" style={{ marginTop: 8 }}>
            <b style={{ color: "var(--ink)" }}>Selected:</b>{" "}
            {selectedMoodWords.length
              ? selectedMoodWords
                  .map((label) => {
                    const found = MOOD_WORDS.find((x) => x.label === label);
                    return found ? `${found.emoji} ${label}` : label;
                  })
                  .join(" · ")
              : "—"}
          </div>
        </div>

        <div>
          <label htmlFor="energy">Energy</label>
          <select
            id="energy"
            value={checkin.energy}
            onChange={(e) => actions.setCheckin({ energy: e.target.value })}
          >
            <option value="okay">Okay</option>
            <option value="low">Low / drained</option>
            <option value="verylow">Very low / depleted</option>
            <option value="high">High / wired</option>
          </select>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <label htmlFor="body">Body</label>
        <select
          id="body"
          value={checkin.body}
          onChange={(e) => actions.setCheckin({ body: e.target.value })}
        >
          <option value="manageable">Manageable</option>
          <option value="achey">Sore / achey</option>
          <option value="tender">Tender</option>
        </select>
      </div>

      <details
        className="noteDetails"
        style={{ marginTop: 12 }}
        onToggle={(e) => setNoteOpen(e.currentTarget.open)}
      >
        <summary className="noteSummary">Optional note (100 characters)</summary>
        <div style={{ marginTop: 8 }}>
          <textarea
            className="noteInput"
            ref={noteRef}
            value={note}
            maxLength={100}
            rows={3}
            placeholder="Anything else to know (e.g., slept great, excited, busy day, bad sleep, headache)…"
            onChange={(e) => actions.setCheckin({ note: e.target.value.slice(0, 100) })}
            onInput={autosizeNote}
            aria-label="Optional note"
          />
          <div className="charCount">{note.length}/100</div>
        </div>
      </details>

      <div style={{ marginTop: 14 }}>
        <label>Pace for today</label>
        <div className="pillrow" role="group" aria-label="Pace">
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              className={"pill" + (level === l.key ? " active" : "")}
              onClick={() => actions.setLevel(l.key)}
            >
              {l.emoji} {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Used to personalize your options and keep suggestions relevant. You can change this anytime.
      </div>

      {!noteOpen && <CalmParticleField />}

      <div className="checkinBottom">
        <div className="footerNote" style={{ marginTop: 12 }}>
          Use the tabs below when you’re ready.
          {checkedInToday ? " Saved for today." : ""}
        </div>
      </div>
    </div>
  );
}
