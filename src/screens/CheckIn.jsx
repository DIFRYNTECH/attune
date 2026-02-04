import { useCallback, useEffect, useRef, useState } from "react";
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

function CalmBallFillToAura() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [mode, setMode] = useState("balls");
  const ballsRef = useRef([]);
  const animationFrameId = useRef();

  const MAX_BALLS_FACTOR = 0.25; // fill 25% of the area
  const BALL_RADIUS = 5;

  const createBall = (canvas) => {
    return {
      x: Math.random() * (canvas.width - BALL_RADIUS * 2) + BALL_RADIUS,
      y: Math.random() * (canvas.height - BALL_RADIUS * 2) + BALL_RADIUS,
      dx: (Math.random() - 0.5) * 2, // speed
      dy: (Math.random() - 0.5) * 2, // speed
      radius: BALL_RADIUS,
      color: `rgba(79, 109, 245, ${Math.random() * 0.5 + 0.3})`,
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || mode !== "balls") return;

    const ctx = canvas.getContext("2d");
    let isRunning = true;

    const resizeCanvas = () => {
      const { width, height } = container.getBoundingClientRect();
      canvas.width = width;
      canvas.height = height;
      if (ballsRef.current.length === 0) {
        ballsRef.current = [createBall(canvas), createBall(canvas)];
      }
    };

    const animate = () => {
      if (!isRunning) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      ballsRef.current.forEach((ball) => {
        ball.x += ball.dx;
        ball.y += ball.dy;

        if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
          ball.dx = -ball.dx;
        }
        if (ball.y + ball.radius > canvas.height || ball.y - ball.radius < 0) {
          ball.dy = -ball.dy;
        }

        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = ball.color;
        ctx.fill();
        ctx.closePath();
      });

      animationFrameId.current = requestAnimationFrame(animate);
    };

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
    resizeCanvas();
    animate();

    return () => {
      isRunning = false;
      resizeObserver.disconnect();
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [mode]);

  const handleClick = () => {
    if (mode !== "balls") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const maxBalls = (canvas.width * canvas.height) / (Math.PI * BALL_RADIUS * BALL_RADIUS) * MAX_BALLS_FACTOR;

    if (ballsRef.current.length < maxBalls) {
      ballsRef.current.push(createBall(canvas), createBall(canvas));
    } else {
      setMode("aura");
    }
  };

  return (
    <div
      ref={containerRef}
      className="calmVisual"
      onClick={handleClick}
      style={{ cursor: mode === "balls" ? "pointer" : "default", pointerEvents: 'auto' }}
    >
      {mode === "balls" && (
        <canvas ref={canvasRef} className="calmCanvas" aria-hidden="true" />
      )}
      {mode === "aura" && <div className="calmAura" aria-hidden="true" />}
    </div>
  );
}

export default function CheckIn({ state, actions }) {
  const { checkin, level, checkedInToday } = state;
  const note = (checkin.note || "").slice(0, 100);
  const noteRef = useRef(null);
  const [noteOpen, setNoteOpen] = useState(false);

  const autosizeNote = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autosizeNote();
  }, [note, autosizeNote]);

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
      next =
        selectedMoodWords.length >= 2
          ? [selectedMoodWords[0], word]
          : [...selectedMoodWords, word];
    }

    const mood = moodCategoryFromWords(next) || checkin.mood || "okay";
    actions.setCheckin({ moodWords: next, mood });
  };

  return (
    <div className="card checkinCard" style={{ display: 'flex', flexDirection: 'column', flex: '1' }}>
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
              : "-"}
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
        Used to personalize your options and keep suggestions relevant. If AI is enabled, your optional note may be used to help build today’s board. You can change this anytime.
      </div>

      {!noteOpen && <CalmBallFillToAura />}

      <div className="checkinBottom">
        <div className="footerNote" style={{ marginTop: 12 }}>
          Use the tabs below when you’re ready.
          {checkedInToday ? " Saved for today." : ""}
        </div>
      </div>
    </div>
  );
}
