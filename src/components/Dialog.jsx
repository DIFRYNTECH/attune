import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isNativePlatform } from "../lib/platform.js";
import "./ActivityBoard.css";

export default function Dialog({ title, label, onClose, footer, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => {
    if (!isNativePlatform()) return;
    let disposed = false;
    let subscription;
    import("@capacitor/app").then(async ({ App }) => {
      if (disposed) return;
      const handle = await App.addListener("backButton", () => closeRef.current());
      if (disposed) await handle.remove();
      else subscription = handle;
    }).catch(() => console.warn("Activity dialog could not attach the native back-button handler."));
    return () => { disposed = true; subscription?.remove(); };
  }, []);
  function handleKeyDown(event) {
    if (event.key !== "Tab") return;
    const controls = [...ref.current.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )].filter(element => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return createPortal(
    <dialog ref={ref} className="appDialog pickDialog" aria-labelledby={label ? undefined : titleId} aria-label={label}
      onKeyDown={handleKeyDown}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pickDialogInner">
        <header className="pickDialogHeader"><h2 id={titleId}>{title}</h2>
          <button type="button" className="pickIcon" aria-label="Close dialog" title="Close" onClick={onClose}><X size={21} /></button>
        </header>
        <div className="pickDialogBody">{children}</div>
        {footer && <footer className="pickDialogActions">{footer}</footer>}
      </div>
    </dialog>, document.body,
  );
}
