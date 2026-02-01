import { useEffect, useMemo, useState } from "react";
import { useAttuneStore } from "../store/useAttuneStore";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ActivityBoard() {
  const { state, actions } = useAttuneStore();
  const { options } = state;

  // 12 tiles: nice, game-board-ish, fits mobile.
  const TILE_COUNT = 12;

  const [revealed, setRevealed] = useState(() => Array(TILE_COUNT).fill(false));
  const [taken, setTaken] = useState(() => Array(TILE_COUNT).fill(false));

  const assigned = useMemo(() => {
    const pool = options?.length ? shuffle(options) : [];
    // Repeat if fewer than tiles so every tile has something.
    const filled = [];
    for (let i = 0; i < TILE_COUNT; i++) {
      filled.push(pool[i % Math.max(pool.length, 1)]);
    }
    return filled;
  }, [options]);

  useEffect(() => {
    // Ensure options exist, then reset board when they change.
    if (!options?.length) actions.refreshOptions();
    setRevealed(Array(TILE_COUNT).fill(false));
    setTaken(Array(TILE_COUNT).fill(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options?.length]);

  const onReveal = (idx) => {
    setRevealed((prev) => {
      if (prev[idx]) return prev;
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  };

  const onAdd = (idx) => {
    const opt = assigned[idx];
    if (!opt || taken[idx]) return;
    actions.addOption(opt);
    setTaken((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  };

  return (
    <div className="boardWrap">
      <div className="boardTop">
        <div className="boardTitle">Pick a tile</div>
        <button type="button" className="btn small" onClick={actions.refreshOptions}>
          New board
        </button>
      </div>

      <div className="boardGrid" role="grid" aria-label="Activity tiles">
        {Array.from({ length: TILE_COUNT }).map((_, idx) => {
          const isRevealed = revealed[idx];
          const isTaken = taken[idx];
          const opt = assigned[idx];

          return (
            <button
              key={idx}
              type="button"
              className={
                "boardTile" +
                (isRevealed ? " revealed" : "") +
                (isTaken ? " taken" : "")
              }
              onClick={() => (isRevealed ? onAdd(idx) : onReveal(idx))}
              aria-pressed={isRevealed}
              title={
                isTaken
                  ? "Added"
                  : isRevealed
                    ? "Tap to add"
                    : "Tap to reveal"
              }
            >
              {!isRevealed && (
                <div className="tileFace" aria-hidden="true">
                  <div className="tileMark" />
                </div>
              )}

              {isRevealed && (
                <div className="tileBack">
                  <div className="tileText">{opt?.text || "…"}</div>
                  <div className="tileHint">
                    {isTaken ? "Added" : "Tap again to add"}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="footerNote" style={{ textAlign: "center", marginTop: 10 }}>
        Reveal a few, then add what feels doable.
      </div>
    </div>
  );
}
