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

function buildBoardAssigned({ options, pinnedTexts, tileCount }) {
  // Stable, no-repeats board assignment.
  // If we run out of unique options, fill with placeholders.
  const list = [];
  const seen = new Set();

  for (const text of pinnedTexts) {
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    list.push({ text });
    if (list.length >= tileCount) return list;
  }

  const pool = options?.length ? shuffle(options) : [];
  for (const o of pool) {
    if (!o?.text) continue;
    if (seen.has(o.text)) continue;
    seen.add(o.text);
    list.push({ text: o.text, level: o.level });
    if (list.length >= tileCount) break;
  }

  while (list.length < tileCount) {
    list.push({ text: "", placeholder: true });
  }

  return list;
}

export default function ActivityBoard({ state: stateProp, actions: actionsProp }) {
  const store = useAttuneStore();
  const state = stateProp || store.state;
  const actions = actionsProp || store.actions;

  const { options, myDay, myDayCap, boardAssigned: storedBoardAssigned } = state;

  const TILE_COUNT = 15;
  const HARD_CAP = 10;

  const [revealed, setRevealed] = useState(() => Array(TILE_COUNT).fill(false));
  const [boardAssigned, setBoardAssigned] = useState(() => {
    if (Array.isArray(storedBoardAssigned) && storedBoardAssigned.length === TILE_COUNT) {
      return storedBoardAssigned;
    }
    return Array.from({ length: TILE_COUNT }).map(() => ({ text: "", placeholder: true }));
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(null); // { idx, opt }

  const takenTexts = useMemo(() => {
    const set = new Set();
    for (const t of myDay || []) {
      if (t?.text) set.add(t.text);
    }
    return set;
  }, [myDay]);

  const pickedCount = myDay?.length || 0;
  const atHardCap = pickedCount >= HARD_CAP;

  const effectiveCap =
    typeof myDayCap === "number" ? Math.min(Math.max(myDayCap, 0), HARD_CAP) : 5;

  const clearBoard = () => {
    setRevealed(Array(TILE_COUNT).fill(false));
    setConfirmOpen(false);
    setPendingAdd(null);
    actions.trackEvent?.("boardCleared", {
      pickedCount: myDay?.length || 0,
      pace: state.level,
      source: state.optionsSource,
    });
    actions.resetToday?.();
    actions.refreshOptions?.();
  };

  const persistBoard = (next) => {
    setBoardAssigned(next);
    actions.setBoardAssigned?.(next);
  };

  useEffect(() => {
    // Ensure options exist, then reset board when options change.
    if (!options?.length) {
      actions.refreshOptions();
      return;
    }

    const pinnedTexts = (myDay || [])
      .map((t) => t?.text)
      .filter(Boolean)
      .filter((t, i, a) => a.indexOf(t) === i);

    let shown = null;
    if (Array.isArray(storedBoardAssigned) && storedBoardAssigned.length === TILE_COUNT) {
      shown = storedBoardAssigned;
      setBoardAssigned(storedBoardAssigned);
    } else {
      const next = buildBoardAssigned({ options, pinnedTexts, tileCount: TILE_COUNT });
      shown = next;
      persistBoard(next);
    }

    const activities = (shown || []).map((x) => (typeof x?.text === "string" ? x.text : "")).filter(Boolean);
    actions.trackEvent?.("activityShown", {
      count: TILE_COUNT,
      activities,
      pace: state.level,
      source: state.optionsSource,
    });
    setRevealed(Array(TILE_COUNT).fill(false));
    setConfirmOpen(false);
    setPendingAdd(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  useEffect(() => {
    // If My Day changes outside of this board, pin new tasks into placeholders
    // without reshuffling existing tiles.
    setBoardAssigned((prev) => {
      const next = [...prev];
      const present = new Set(next.map((x) => x?.text).filter(Boolean));

      let changed = false;
      for (const t of myDay || []) {
        if (!t?.text) continue;
        if (present.has(t.text)) continue;

        const slot = next.findIndex((x) => x?.placeholder);
        if (slot === -1) break;
        next[slot] = { text: t.text };
        present.add(t.text);
        changed = true;
      }

      if (changed) actions.setBoardAssigned?.(next);
      return changed ? next : prev;
    });
  }, [myDay, actions]);

  useEffect(() => {
    // Keep already-picked tasks visible.
    setRevealed((prev) => {
      const next = [...prev];
      for (let i = 0; i < TILE_COUNT; i++) {
        const txt = boardAssigned[i]?.text;
        if (txt && takenTexts.has(txt)) next[i] = true;
      }
      return next;
    });
  }, [boardAssigned, takenTexts]);

  const onAdd = (idx) => {
    const opt = boardAssigned[idx];
    if (!opt?.text) return;

    // Single-click behavior: reveal the tile when selecting.
    setRevealed((prev) => {
      if (prev[idx]) return prev;
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    if (takenTexts.has(opt.text)) {
      actions.setToast?.("Already in your day. Trying is enough.", true);
      return;
    }

    if (pickedCount >= HARD_CAP) {
      actions.setToast?.("That’s plenty for today. Let’s cap it at 10.", false);
      return;
    }

    if (pickedCount >= effectiveCap && effectiveCap < HARD_CAP) {
      setPendingAdd({ idx, opt });
      setConfirmOpen(true);
      return;
    }

    actions.addOption({ text: opt.text, level: opt.level });
  };

  const closeConfirm = () => {
    setConfirmOpen(false);
    setPendingAdd(null);
  };

  const confirmMore = () => {
    if (!pendingAdd) {
      closeConfirm();
      return;
    }
    if (pickedCount >= HARD_CAP) {
      actions.setToast?.("That’s plenty for today. Let’s cap it at 10.", false);
      closeConfirm();
      return;
    }
    actions.setMyDayCap?.(HARD_CAP);
    actions.addOption({ text: pendingAdd.opt.text, level: pendingAdd.opt.level });
    closeConfirm();
  };

  return (
    <div className="boardWrap">
      <div className="boardTop">
        <div className="boardTitle">Pick a tile</div>

        <div className="boardRight">
          <div className="boardMeta" aria-label="Picked count">
            {pickedCount}/{effectiveCap} picked
            {effectiveCap < HARD_CAP ? "" : " (max 10)"}
          </div>
          <button type="button" className="btn small ghost" onClick={clearBoard}>
            Clear board
          </button>
        </div>
      </div>

      {confirmOpen && (
        <div
          className="modalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirm();
          }}
        >
          <div
            className="modalCard"
            role="dialog"
            aria-modal="true"
            aria-labelledby="moreActivitiesTitle"
            aria-describedby="moreActivitiesDesc"
          >
            <div className="modalTitle" id="moreActivitiesTitle">
              Add more activities?
            </div>
            <div className="modalBody" id="moreActivitiesDesc">
              You’ve already picked 5. If you keep adding, we’ll cap today at 10.
              Just to keep it light 🙂
            </div>
            <div className="modalActions">
              <button type="button" className="btn small ghost" onClick={closeConfirm}>
                Keep it at 5
              </button>
              <button type="button" className="btn small primary" onClick={confirmMore}>
                Yes, add more (max 10)
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="boardGrid" role="grid" aria-label="Activity tiles">
        {Array.from({ length: TILE_COUNT }).map((_, idx) => {
          const opt = boardAssigned[idx];
          const isPlaceholder = !!opt?.placeholder || !opt?.text;
          const isTaken = !!opt?.text && takenTexts.has(opt.text);

          // Once the user hits the hard cap, don't show any more option text.
          // Keep only already-added tasks visible.
          const isRevealed = isTaken || (!atHardCap && revealed[idx]);

          // Disable placeholders always; disable everything else at hard cap unless already taken.
          const isDisabled = isPlaceholder || (atHardCap && !isTaken);

          return (
            <button
              key={idx}
              type="button"
              className={
                "boardTile" +
                (isRevealed ? " revealed" : "") +
                (isTaken ? " taken" : "") +
                (isDisabled ? " disabled" : "")
              }
              onClick={() => {
                if (isDisabled) {
                  if (isPlaceholder) {
                    actions.setToast?.("No more options on this board.", false);
                    return;
                  }
                  actions.setToast?.("That’s plenty for today. Let’s stop at 10.", false);
                  return;
                }

                if (isTaken) {
                  actions.setToast?.("Already in your day. Trying is enough.", true);
                  return;
                }

                // Single click selects/adds the tile.
                return onAdd(idx);
              }}
              aria-pressed={isTaken}
              aria-disabled={isDisabled ? "true" : undefined}
              title={
                isTaken
                  ? "Already in your day"
                  : isPlaceholder
                    ? "No more options"
                    : isDisabled
                      ? "You’ve reached today’s cap"
                      : (isRevealed && opt?.text ? opt.text : "Tap to add")
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
                </div>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
