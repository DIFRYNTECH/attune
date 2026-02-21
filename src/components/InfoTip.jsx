import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export default function InfoTip({ label = "More info", children, align = "right" }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const bubbleRef = useRef(null);
  const tipId = useId();
  const [pos, setPos] = useState(null);

  const computePosition = useCallback(() => {
    const btn = btnRef.current;
    const bubble = bubbleRef.current;
    if (!btn || !bubble) return;

    const rect = btn.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const gap = 8;
    const margin = 8;

    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;

    const preferBelowTop = rect.bottom + gap;
    const preferAboveTop = rect.top - gap - bubbleRect.height;
    const fitsBelow = preferBelowTop + bubbleRect.height <= vh - margin;
    const fitsAbove = preferAboveTop >= margin;
    const top = fitsBelow || !fitsAbove ? preferBelowTop : preferAboveTop;

    let left;
    if (align === "left") left = rect.left;
    else left = rect.right - bubbleRect.width;

    // Clamp within viewport.
    left = Math.max(margin, Math.min(vw - margin - bubbleRect.width, left));

    setPos({ top: Math.round(top), left: Math.round(left) });
  }, [align]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }

    function onPointerDown(e) {
      const root = rootRef.current;
      const bubble = bubbleRef.current;
      const t = e.target;
      if (root && root.contains(t)) return;
      if (bubble && bubble.contains(t)) return;
      setOpen(false);
    }

    function onReflow() {
      computePosition();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onReflow, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onReflow, true);
    };
  }, [open, computePosition]);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    // Also reposition after first paint (fonts/layout settle).
    const raf = window.requestAnimationFrame(() => computePosition());
    return () => window.cancelAnimationFrame(raf);
  }, [open, children, computePosition]);

  return (
    <span ref={rootRef} className={"infoTip" + (open ? " open" : "") + (align === "left" ? " left" : "")}>
      <button
        type="button"
        className="infoBtn"
        ref={btnRef}
        aria-label={label}
        aria-expanded={open ? "true" : "false"}
        aria-controls={open ? tipId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open
        ? createPortal(
            <span
              id={tipId}
              ref={bubbleRef}
              role="tooltip"
              className={"infoBubble" + (align === "left" ? " left" : "")}
              style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}
            >
              {children}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
