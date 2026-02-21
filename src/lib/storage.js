const KEY = "attune_v0_state";

export function todayKey(d = new Date()) {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveState(state) {
  // Toasts are ephemeral UI; don't persist them.
  const { toast: _toast, paywall: _paywall, ...rest } = state || {};
  localStorage.setItem(KEY, JSON.stringify(rest));
}
