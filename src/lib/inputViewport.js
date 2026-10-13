export const KEYBOARD_VISIBILITY_EVENT = "attune:keyboard-visibility";

export function installInputViewport(win = window, doc = document) {
  const root = doc.documentElement;
  const viewport = win.visualViewport;
  let nativeKeyboardVisible = false;
  let frame = null;

  function update() {
    frame = null;
    // Pinch zoom must not resize the app's layout underneath the user.
    if (viewport && viewport.scale !== 1) return;
    const height = viewport?.height || win.innerHeight;
    if (height > 0) root.style.setProperty("--appViewportHeight", `${Math.round(height)}px`);
    const input = doc.activeElement;
    const editing = input?.matches?.("textarea, input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit])");
    const visible = !!editing && (nativeKeyboardVisible || win.innerHeight - height > 120);
    if (visible) root.dataset.keyboardOpen = "true";
    else delete root.dataset.keyboardOpen;
    if (editing) input.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
  }

  function schedule() {
    if (frame !== null) win.cancelAnimationFrame(frame);
    frame = win.requestAnimationFrame(update);
  }

  function onNativeKeyboard(event) {
    nativeKeyboardVisible = event.detail?.visible === true;
    schedule();
  }

  win.addEventListener("resize", schedule);
  win.addEventListener(KEYBOARD_VISIBILITY_EVENT, onNativeKeyboard);
  viewport?.addEventListener("resize", schedule);
  doc.addEventListener("focusin", schedule);
  doc.addEventListener("focusout", schedule);
  update();

  return () => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    win.removeEventListener("resize", schedule);
    win.removeEventListener(KEYBOARD_VISIBILITY_EVENT, onNativeKeyboard);
    viewport?.removeEventListener("resize", schedule);
    doc.removeEventListener("focusin", schedule);
    doc.removeEventListener("focusout", schedule);
    root.style.removeProperty("--appViewportHeight");
    delete root.dataset.keyboardOpen;
  };
}
