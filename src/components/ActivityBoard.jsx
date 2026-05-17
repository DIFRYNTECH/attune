import { useEffect, useMemo, useRef, useState } from "react";
import { useAttuneStore } from "../store/useAttuneStore";
import { getAttuneRecommendedPicks, smartPickPool } from "../lib/smartPick";

const PACE_LABELS = {
  rest: "rest",
  gentle: "gentle",
  light: "light",
  steady: "steady",
  capable: "capable",
  brave: "brave",
};

const FALLBACK_TIME_BY_PACE = {
  rest: "2-5 min",
  gentle: "3-5 min",
  light: "5-8 min",
  steady: "8-10 min",
  capable: "10-15 min",
  brave: "5-20 min",
};

function normalizeMoodWord(word) {
  if (word === "Steady") return "Settled";
  if (word === "Anxious") return "Overwhelmed";
  if (word === "Flat") return "Tired";
  return word;
}

function getActivityTimeCue(text, level) {
  const source = String(text || "");
  const explicit = source.match(/(\d+)\s*(?:-\s*(\d+))?\s*(?:min|minute)/i);
  if (explicit) return explicit[2] ? `${explicit[1]}-${explicit[2]} min` : `${explicit[1]} min`;
  if (/\bone\b|\b1\b/i.test(source)) return "One small thing";
  return FALLBACK_TIME_BY_PACE[level] || "5 min";
}

function getActivitySetupCue(text) {
  const source = String(text || "").toLowerCase();
  if (/walk|outside|fresh air|sky|sunlight|window/.test(source)) return "Step outside";
  if (/write|list|note|plan|proud|wins|looking forward|boundary/.test(source)) return "Just notes";
  if (/message|call|voice/.test(source)) return "Phone optional";
  if (/song|music|podcast|video|watch|listen/.test(source)) return "Audio cue";
  if (/drink|snack|meal|cook|water/.test(source)) return "Kitchen cue";
  if (/tidy|organize|sort|fold|clear|drawer|surface|pile|space/.test(source)) return "Small space";
  if (/stretch|yoga|mobility|movement|breath|body scan|strength/.test(source)) return "Body reset";
  if (/blanket|candle|lotion|oil|comfort|warm|shower|wash/.test(source)) return "Comfort cue";
  return "No setup";
}

function getActivityFitLine({ opt, state, isAttunePick }) {
  const checkin = state?.checkin || {};
  const moodWords = Array.isArray(checkin.moodWords)
    ? checkin.moodWords.map(normalizeMoodWord)
    : [];
  const hasMood = (word) => moodWords.includes(word);
  const level = typeof opt?.level === "string" ? opt.level : state?.level;
  const pace = PACE_LABELS[level] || "today";
  const prefix = isAttunePick ? "Attune marked this because it " : "This ";

  if (checkin.energy === "verylow" || hasMood("Worn out")) {
    return `${prefix}keeps the first move low-friction for very low energy.`;
  }
  if (checkin.energy === "low" || hasMood("Tired")) {
    return `${prefix}keeps the start small, so it does not ask too much of you.`;
  }
  if (hasMood("Overwhelmed")) {
    return `${prefix}gives you one clear step instead of a whole plan.`;
  }
  if (hasMood("Restless")) {
    return `${prefix}gives restless energy somewhere gentle to go.`;
  }
  if (checkin.body === "tender") {
    return `${prefix}stays gentle on a tender body.`;
  }
  if (checkin.body === "achey") {
    return `${prefix}keeps the strain low for a sore body.`;
  }
  if (hasMood("Motivated")) {
    return `${prefix}uses today's motivation without turning it into pressure.`;
  }
  if (hasMood("Hopeful") || hasMood("Settled")) {
    return `${prefix}builds on the steadier mood you checked in with.`;
  }
  return `${prefix}fits your ${pace} pace today.`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function boardOptionSnapshot(option) {
  const text = typeof option?.text === "string" ? option.text : "";
  if (!text) return { text: "", placeholder: true };

  const out = { text };
  for (const key of [
    "level",
    "mode",
    "domain",
    "effort",
    "friction",
    "pace",
    "canonicalKey",
    "canonical_key",
    "repetitionFamily",
    "repetition_family",
    "safetyReviewed",
    "safety_reviewed",
  ]) {
    if (option?.[key] !== undefined && option?.[key] !== "") out[key] = option[key];
  }
  return out;
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
    list.push(boardOptionSnapshot(o));
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

    next[i] = boardOptionSnapshot(slot);
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

    next[slot] = boardOptionSnapshot(candidate);
    seen.add(candidate.text);
  }

  for (let i = 0; i < tileCount; i += 1) {
    if (next[i]?.text) continue;

    while (poolIndex < optionsPool.length) {
      const candidate = optionsPool[poolIndex];
      poolIndex += 1;

      const text = typeof candidate?.text === "string" ? candidate.text : "";
      if (!text || seen.has(text)) continue;

      next[i] = boardOptionSnapshot(candidate);
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

  // Snapshot attune picks when options change, not on every event update.
  // This prevents markers from jumping to different tiles after picking.
  const attunePicksRef = useRef([]);
  const attunePicks = useMemo(() => {
    if (!canSmartPick) {
      attunePicksRef.current = [];
      return [];
    }
    const picks = getAttuneRecommendedPicks(options, state?.events, { limit: 3 });
    attunePicksRef.current = picks;
    return picks;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, canSmartPick]);

  const attunePickOrder = useMemo(() => {
    const map = new Map();
    for (let i = 0; i < attunePicksRef.current.length; i += 1) {
      const text = typeof attunePicksRef.current[i]?.text === "string" ? attunePicksRef.current[i].text : "";
      if (!text || map.has(text)) continue;
      map.set(text, i);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, canSmartPick]);

  const [revealed, setRevealed] = useState(() => Array(TILE_COUNT).fill(false));
  const [revealFx, setRevealFx] = useState(() => Array(TILE_COUNT).fill(false));
  const [passedTiles, setPassedTiles] = useState(() => Array(TILE_COUNT).fill(false));
  const [attunePickFx, setAttunePickFx] = useState(() => Array(TILE_COUNT).fill(false));
  const [boardAssigned, setBoardAssigned] = useState(() => {
    if (Array.isArray(storedBoardAssigned) && storedBoardAssigned.length === TILE_COUNT) {
      return storedBoardAssigned;
    }
    return Array.from({ length: TILE_COUNT }).map(() => ({ text: "", placeholder: true }));
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAdd, setPendingAdd] = useState(null); // { idx, opt }
  const [selectedTileIdx, setSelectedTileIdx] = useState(null);
  const revealTimeoutsRef = useRef(new Map());
  const attunePickTimeoutsRef = useRef(new Map());

  const takenTexts = useMemo(() => {
    const set = new Set();
    for (const t of myDay || []) {
      if (t?.text) set.add(t.text);
    }
    return set;
  }, [myDay]);

  // Visual display order: always float attune picks to the first slots so they
  // never drift down the grid after picks or board rebuilds.
  const displayOrder = useMemo(() => {
    const indices = Array.from({ length: TILE_COUNT }, (_, i) => i);
    return indices.sort((a, b) => {
      const aIsAttune = attunePickOrder.has(boardAssigned[a]?.text || "");
      const bIsAttune = attunePickOrder.has(boardAssigned[b]?.text || "");
      if (aIsAttune && !bIsAttune) return -1;
      if (!aIsAttune && bIsAttune) return 1;
      return a - b;
    });
  }, [boardAssigned, attunePickOrder]);

  const pickedCount = myDay?.length || 0;
  const atHardCap = pickedCount >= HARD_CAP;

  const effectiveCap =
    typeof myDayCap === "number" ? Math.min(Math.max(myDayCap, 0), HARD_CAP) : 5;

  const selectedTile = selectedTileIdx === null ? null : boardAssigned[selectedTileIdx];
  const selectedIsTaken = !!selectedTile?.text && takenTexts.has(selectedTile.text);
  const selectedMyDayTask = selectedTile?.text
    ? (myDay || []).find((task) => task?.text === selectedTile.text)
    : null;
  const selectedAttuneRank = selectedTile?.text ? attunePickOrder.get(selectedTile.text) : undefined;
  const selectedIsAttunePick = typeof selectedAttuneRank === "number";
  const selectedFitLine = selectedTile?.text
    ? getActivityFitLine({ opt: selectedTile, state, isAttunePick: selectedIsAttunePick })
    : "";
  const selectedTimeCue = selectedTile?.text
    ? getActivityTimeCue(selectedTile.text, selectedTile.level || state.level)
    : "";
  const selectedSetupCue = selectedTile?.text ? getActivitySetupCue(selectedTile.text) : "";

  const clearBoard = () => {
    revealTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    revealTimeoutsRef.current.clear();
    setRevealed(Array(TILE_COUNT).fill(false));
    setRevealFx(Array(TILE_COUNT).fill(false));
    setPassedTiles(Array(TILE_COUNT).fill(false));
    setConfirmOpen(false);
    setPendingAdd(null);
    setSelectedTileIdx(null);
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

    const uniqueOptionCount = new Set(
      options
        .map((option) => (typeof option?.text === "string" ? option.text.trim() : ""))
        .filter(Boolean)
    ).size;

    if (state.optionsSource === "default" && uniqueOptionCount < TILE_COUNT) {
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

    const activities = (shown || []).map((x) => boardOptionSnapshot(x)).filter((x) => x.text);
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
    setPassedTiles(Array(TILE_COUNT).fill(false));
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
        }, 3000 + attunePickOrder.get(text) * 90);

        attunePickTimeoutsRef.current.set(i, timeoutId);
      }

      return next;
    });
    setConfirmOpen(false);
    setPendingAdd(null);
    setSelectedTileIdx(null);
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
        next[slot] = boardOptionSnapshot(t);
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

  const revealTile = (idx) => {
    let didReveal = false;
    setRevealed((prev) => {
      if (prev[idx]) return prev;
      didReveal = true;
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    if (didReveal) triggerRevealFx(idx);
  };

  const closeDetail = () => {
    setSelectedTileIdx(null);
  };

  const passSelectedTile = () => {
    if (selectedTileIdx !== null && selectedTile?.text) {
      if (selectedMyDayTask?.id) {
        actions.removeTask?.(selectedMyDayTask.id);
      }
      setPassedTiles((prev) => {
        const next = [...prev];
        next[selectedTileIdx] = true;
        return next;
      });
    }
    closeDetail();
  };

  const onAdd = (idx) => {
    if (loading) return;

    const opt = boardAssigned[idx];
    if (!opt?.text) return;

    if (takenTexts.has(opt.text)) {
      actions.setToast?.("Already in your day. Trying is enough.", true);
      return;
    }

    if (pickedCount >= HARD_CAP) {
      setSelectedTileIdx(null);
      actions.setToast?.("That’s plenty for today. Let’s cap it at 10.", false);
      return;
    }

    if (pickedCount >= effectiveCap && effectiveCap < HARD_CAP) {
      setSelectedTileIdx(null);
      setPendingAdd({ idx, opt });
      setConfirmOpen(true);
      return;
    }

    // Reveal the tile then add it.
    revealTile(idx);
    actions.addOption(boardOptionSnapshot(opt));
    setPassedTiles((prev) => {
      if (!prev[idx]) return prev;
      const next = [...prev];
      next[idx] = false;
      return next;
    });
    setSelectedTileIdx(null);
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
    revealTile(pendingAdd.idx);
    actions.addOption(boardOptionSnapshot(pendingAdd.opt));
    setPassedTiles((prev) => {
      if (!prev[pendingAdd.idx]) return prev;
      const next = [...prev];
      next[pendingAdd.idx] = false;
      return next;
    });
    setSelectedTileIdx(null);
    closeConfirm();
  };

  return (
    <div className={"boardWrap" + (loading ? " loading" : "")} aria-busy={loading ? "true" : undefined}>
      <div className="boardTop">
        <div className="boardTitle">What feels right?</div>

        <div className="boardRight">
          <div className="boardMeta" aria-label="Picked count">
            {pickedCount}/{effectiveCap} in My Day
            {effectiveCap < HARD_CAP ? "" : " (max 10)"}
          </div>
          <button type="button" className="btn small ghost" onClick={clearBoard} disabled={loading}>
            Reset today
          </button>
        </div>
      </div>

      <div className="boardRevealHint">Tap any tile to reveal a small step.</div>

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
              You’ve already added 5 steps to My Day. If you keep adding, we’ll cap today at 10.
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
        {displayOrder.map((idx) => {
          const opt = boardAssigned[idx];
          const isPlaceholder = !!opt?.placeholder || !opt?.text;
          const isTaken = !!opt?.text && takenTexts.has(opt.text);
          const isPassed = !!opt?.text && !isTaken && passedTiles[idx];
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
                (isPassed ? " passed" : "") +
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

                if (isPassed) {
                  setSelectedTileIdx(idx);
                  return;
                }

                if (isTaken) {
                  setSelectedTileIdx(idx);
                  return;
                }

                revealTile(idx);
                setSelectedTileIdx(idx);
              }}
              aria-pressed={isTaken}
              aria-disabled={isDisabled ? "true" : undefined}
              title={
                isPassed
                  ? "Set aside"
                  : isTaken
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

              {isTaken ? <span className="tileAddedMark" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      {selectedTile?.text && (
        <div
          className="activityDetailOverlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeDetail();
          }}
        >
          <section
            className="activityDetailSheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activityDetailTitle"
            aria-describedby="activityDetailWhy"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="activityDetailHandle" aria-hidden="true" />

            <div className="activityDetailKicker">
              <span>{selectedIsAttunePick ? "Attune pick" : "Small step"}</span>
              {selectedIsTaken ? <span className="activityDetailState">In My Day</span> : null}
            </div>

            <h3 className="activityDetailTitle" id="activityDetailTitle">
              {selectedTile.text}
            </h3>

            <div className="activityDetailWhy" id="activityDetailWhy">
              <span>Why this fits</span>
              <p>{selectedFitLine}</p>
            </div>

            <div className="activityDetailChips" aria-label="Activity details">
              <span>{selectedTimeCue}</span>
              <span>{selectedSetupCue}</span>
              <span>{PACE_LABELS[selectedTile.level || state.level] || "today"} pace</span>
            </div>

            <div className="activityDetailActions">
              <button
                type="button"
                className="btn primary activityDetailPrimary"
                onClick={() => {
                  if (selectedTileIdx !== null) onAdd(selectedTileIdx);
                }}
                disabled={selectedIsTaken}
              >
                {selectedIsTaken ? "Added to My Day" : "Add to My Day"}
              </button>
              <button type="button" className="btn ghost activityDetailSecondary" onClick={passSelectedTile}>
                Pick something else
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
