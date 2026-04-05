import { useEffect, useMemo, useRef, useState } from "react";
import { useAttuneStore } from "../store/useAttuneStore";
import { getAttuneRecommendedPicks, smartPickPool } from "../lib/smartPick";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildBoardAssigned({ pool, pinnedTexts, tileCount }) {
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

  const optionsPool = Array.isArray(pool) ? pool : [];
  for (const o of optionsPool) {
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

function mergeBoardAssigned({ existingBoard, pool, preservedTexts, prioritizedTexts, tileCount }) {
  const next = Array.from({ length: tileCount }).map(() => ({ text: "", placeholder: true }));
  const preserved = new Set(Array.isArray(preservedTexts) ? preservedTexts.filter(Boolean) : []);
  const prioritized = Array.isArray(prioritizedTexts) ? prioritizedTexts.filter(Boolean) : [];
  const seen = new Set();

  const currentBoard = Array.isArray(existingBoard) ? existingBoard : [];
  for (let i = 0; i < tileCount; i += 1) {
    const slot = currentBoard[i];
    const text = typeof slot?.text === "string" ? slot.text : "";
    if (!text || !preserved.has(text) || seen.has(text)) continue;

    next[i] = { text, level: slot?.level };
    seen.add(text);
  }

  const optionsPool = Array.isArray(pool) ? pool : [];
  let poolIndex = 0;

  for (const prioritizedText of prioritized) {
    if (!prioritizedText || seen.has(prioritizedText)) continue;

    const candidate = optionsPool.find((option) => option?.text === prioritizedText);
    if (!candidate) continue;

    const slot = next.findIndex((entry) => !entry?.text);
    if (slot === -1) break;

    next[slot] = { text: candidate.text, level: candidate?.level };
    seen.add(candidate.text);
  }

  for (let i = 0; i < tileCount; i += 1) {
    if (next[i]?.text) continue;

    while (poolIndex < optionsPool.length) {
      const candidate = optionsPool[poolIndex];
      poolIndex += 1;

      const text = typeof candidate?.text === "string" ? candidate.text : "";
      if (!text || seen.has(text)) continue;

      next[i] = { text, level: candidate?.level };
      seen.add(text);
      break;
    }
  }

  return next;
}

export default function ActivityBoard({ state: stateProp, actions: actionsProp, loading = false }) {
  const store = useAttuneStore();
  const state = stateProp || store.state;
  const actions = actionsProp || store.actions;

  const { options, myDay, myDayCap, boardAssigned: storedBoardAssigned } = state;

  const TILE_COUNT = 15;
  const HARD_CAP = 10;

  const canSmartPick = !!state?.entitlements?.smartPick;
  const optionsPool = useMemo(() => {
    const base = Array.isArray(options) ? options : [];
    if (!base.length) return [];

    const nowMs = Date.now();

    // Free mode: keep the existing behavior (pure shuffle from today's check-in pool).
    if (!canSmartPick) return shuffle(base);

    // Plus: bias which options surface using local event history.
    return smartPickPool(base, state?.events, { nowMs });
  }, [options, canSmartPick, state?.events]);

  const attunePicks = useMemo(() => {
    if (!canSmartPick) return [];
    return getAttuneRecommendedPicks(options, state?.events, { limit: 3 });
  }, [options, canSmartPick, state?.events]);

  const attunePickOrder = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < attunePicks.length; i += 1) {
      const text = typeof attunePicks[i]?.text === "string" ? attunePicks[i].text : "";
      if (!text || map.has(text)) continue;
      map.set(text, i);
    }
    return map;
  }, [attunePicks]);

  const [revealed, setRevealed] = useState(() => Array(TILE_COUNT).fill(false));
  const [revealFx, setRevealFx] = useState(() => Array(TILE_COUNT).fill(false));
  const [attunePickFx, setAttunePickFx] = useState(() => Array(TILE_COUNT).fill(false));
  const [boardAssigned, setBoardAssigned] = useState(() => {
    if (Array.isArray(storedBoardAssigned) && storedBoardAssigned.length === TILE_COUNT) {
      return storedBoardAssigned;
    }
    return Array.from({ length: TILE_COUNT }).map(() => ({ text: "", placeholder: true }));
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(null); // { idx, opt }
  const revealTimeoutsRef = useRef(new Map());
  const attunePickTimeoutsRef = useRef(new Map());

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
    revealTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    revealTimeoutsRef.current.clear();
    setRevealed(Array(TILE_COUNT).fill(false));
    setRevealFx(Array(TILE_COUNT).fill(false));
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

  const triggerRevealFx = (idx) => {
    const timeouts = revealTimeoutsRef.current;
    const existing = timeouts.get(idx);
    if (existing) window.clearTimeout(existing);

    setRevealFx((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    const timeoutId = window.setTimeout(() => {
      setRevealFx((prev) => {
        const next = [...prev];
        next[idx] = false;
        return next;
      });
      timeouts.delete(idx);
    }, 560);

    timeouts.set(idx, timeoutId);
  };

  useEffect(() => () => {
    revealTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    revealTimeoutsRef.current.clear();
    attunePickTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    attunePickTimeoutsRef.current.clear();
  }, []);

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
    const attunePickTexts = attunePicks
      .map((pick) => pick?.text)
      .filter(Boolean)
      .filter((text, i, list) => list.indexOf(text) === i);
    const prioritizedTexts = [...pinnedTexts, ...attunePickTexts].filter((text, i, list) => list.indexOf(text) === i);

    const existingBoardForMerge =
      Array.isArray(storedBoardAssigned) && storedBoardAssigned.length === TILE_COUNT
        ? storedBoardAssigned
        : (Array.isArray(boardAssigned) && boardAssigned.length === TILE_COUNT ? boardAssigned : null);

    const canMergeExistingBoard =
      Array.isArray(existingBoardForMerge) &&
      existingBoardForMerge.length === TILE_COUNT &&
      pinnedTexts.length > 0;

    let shown = null;
    if (canMergeExistingBoard) {
      const merged = mergeBoardAssigned({
        existingBoard: existingBoardForMerge,
        pool: optionsPool,
        preservedTexts: pinnedTexts,
        prioritizedTexts,
        tileCount: TILE_COUNT,
      });
      shown = merged;
      persistBoard(merged);
    } else {
      const next = buildBoardAssigned({ pool: optionsPool, pinnedTexts: prioritizedTexts, tileCount: TILE_COUNT });
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
    revealTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    revealTimeoutsRef.current.clear();
    attunePickTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    attunePickTimeoutsRef.current.clear();
    setRevealed(Array(TILE_COUNT).fill(false));
    setRevealFx(Array(TILE_COUNT).fill(false));
    setAttunePickFx(() => {
      const next = Array(TILE_COUNT).fill(false);
      if (!canSmartPick || !attunePickOrder.size) return next;

      for (let i = 0; i < TILE_COUNT; i += 1) {
        const text = typeof shown?.[i]?.text === "string" ? shown[i].text : "";
        if (!attunePickOrder.has(text)) continue;
        next[i] = true;

        const timeoutId = window.setTimeout(() => {
          setAttunePickFx((prev) => {
            const updated = [...prev];
            updated[i] = false;
            return updated;
          });
          attunePickTimeoutsRef.current.delete(i);
        }, 1200 + attunePickOrder.get(text) * 90);

        attunePickTimeoutsRef.current.set(i, timeoutId);
      }

      return next;
    });
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
    if (loading) return;

    const opt = boardAssigned[idx];
    if (!opt?.text) return;

    // Single-click behavior: reveal the tile when selecting.
    let didReveal = false;
    setRevealed((prev) => {
      if (prev[idx]) return prev;
      didReveal = true;
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    if (didReveal) triggerRevealFx(idx);

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
    <div className={"boardWrap" + (loading ? " loading" : "")} aria-busy={loading ? "true" : undefined}>
      <div className="boardTop">
        <div className="boardTitle">What feels right?</div>

        <div className="boardRight">
          <div className="boardMeta" aria-label="Picked count">
            {pickedCount}/{effectiveCap} picked
            {effectiveCap < HARD_CAP ? "" : " (max 10)"}
          </div>
          <button type="button" className="btn small ghost" onClick={clearBoard} disabled={loading}>
            Reset today
          </button>
        </div>
      </div>

      {canSmartPick && attunePicks.length > 0 && (
        <div className="boardSmartHint" aria-label="Attune recommendations">
          Attune marked 3 suggestions for you today.
        </div>
      )}

      {loading && (
        <div className="boardLoadingOverlay" role="status" aria-live="polite" aria-label="Preparing your activity board">
          <div className="boardLoadingCard">
            <div className="boardLoadingPulse" aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="boardLoadingTitle">Personalizing your board</div>
            <div className="boardLoadingText">
              Holding the tiles for a moment while Attune matches your check-in to calmer, more relevant options.
            </div>
          </div>
        </div>
      )}

      {confirmOpen && (
        <div
          className="modalOverlay modalOverlayCentered confirmModalOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeConfirm();
          }}
        >
          <div
            className="modalCard confirmModalCard"
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
          const attunePickRank = opt?.text ? attunePickOrder.get(opt.text) : undefined;
          const isAttunePick = typeof attunePickRank === "number";

          // Once the user hits the hard cap, don't show any more option text.
          // Keep only already-added tasks visible.
          const isRevealed = isTaken || (!atHardCap && revealed[idx]);

          // Disable placeholders always; disable everything else at hard cap unless already taken.
          const isDisabled = loading || isPlaceholder || (atHardCap && !isTaken);

          return (
            <button
              key={idx}
              type="button"
              className={
                "boardTile" +
                (isAttunePick ? " attunePick" : "") +
                (attunePickFx[idx] ? " attunePickIntro" : "") +
                (isRevealed ? " revealed" : "") +
                (revealFx[idx] ? " revealing" : "") +
                (isTaken ? " taken" : "") +
                (isDisabled ? " disabled" : "")
              }
              style={
                isAttunePick
                  ? { "--board-pick-delay": `${attunePickRank * 80}ms` }
                  : undefined
              }
              onClick={() => {
                if (isDisabled) {
                  if (loading) {
                    return;
                  }
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
                      : (isRevealed && opt?.text ? `${opt.text}${isAttunePick ? " · Attune pick" : ""}` : (isAttunePick ? "Tap to add · Attune pick" : "Tap to add"))
              }
            >
              {!isRevealed && (
                <div className="tileFace" aria-hidden="true">
                  <div className="tileMark" />
                </div>
              )}

              {isRevealed && (
                <div className="tileBack">
                  <div className={"tileText" + ((opt?.text?.length || 0) > 90 ? " xs" : (opt?.text?.length || 0) > 55 ? " sm" : "")}>{opt?.text || "…"}</div>
                </div>
              )}
            </button>
          );
        })}
      </div>

    </div>
  );
}
