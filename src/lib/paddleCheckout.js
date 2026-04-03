const PADDLE_SCRIPT_SRC = "https://cdn.paddle.com/paddle/v2/paddle.js";

const PADDLE_CLIENT_TOKEN = String(import.meta.env.VITE_PADDLE_CLIENT_TOKEN || "").trim();
const PADDLE_PLUS_PRICE_ID = String(import.meta.env.VITE_PADDLE_PLUS_PRICE_ID || "").trim();
const PADDLE_ENV = String(import.meta.env.VITE_PADDLE_ENV || "").trim().toLowerCase();

let paddleScriptPromise = null;
let paddleInitialized = false;
let currentEventHandler = null;

function getPaddleWindow() {
  if (typeof window === "undefined") return null;
  return window.Paddle || null;
}

function isSandbox() {
  if (PADDLE_ENV === "sandbox") return true;
  if (PADDLE_ENV === "live") return false;
  return PADDLE_CLIENT_TOKEN.startsWith("test_");
}

function setEventHandler(handler) {
  currentEventHandler = typeof handler === "function" ? handler : null;
}

function forwardPaddleEvent(event) {
  if (typeof currentEventHandler !== "function") return;
  try {
    currentEventHandler(event);
  } catch {
    // Ignore UI callback failures so checkout state is not broken.
  }
}

function loadScript() {
  if (paddleScriptPromise) return paddleScriptPromise;

  paddleScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PADDLE_SCRIPT_SRC}"]`);
    const resolved = getPaddleWindow();
    if (resolved) {
      resolve(resolved);
      return;
    }

    if (existing) {
      existing.addEventListener("load", () => resolve(getPaddleWindow()), { once: true });
      existing.addEventListener("error", () => reject(new Error("paddle_script_load_failed")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = PADDLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve(getPaddleWindow());
    script.onerror = () => reject(new Error("paddle_script_load_failed"));
    document.head.appendChild(script);
  });

  return paddleScriptPromise;
}

async function ensurePaddleInitialized(onEvent) {
  if (!PADDLE_CLIENT_TOKEN || !PADDLE_PLUS_PRICE_ID) {
    throw new Error("paddle_not_configured");
  }

  const paddle = await loadScript();
  if (!paddle) throw new Error("paddle_script_load_failed");

  setEventHandler(onEvent);

  if (!paddleInitialized) {
    if (isSandbox() && paddle.Environment?.set) {
      paddle.Environment.set("sandbox");
    }

    paddle.Initialize({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: forwardPaddleEvent,
    });
    paddleInitialized = true;
  }

  return paddle;
}

export function isPaddleCheckoutSupported() {
  return !!PADDLE_CLIENT_TOKEN && !!PADDLE_PLUS_PRICE_ID;
}

export async function openPaddleCheckout({ email, userId, onEvent } = {}) {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId) throw new Error("missing_account_id");

  const paddle = await ensurePaddleInitialized(onEvent);
  const normalizedEmail = typeof email === "string" ? email.trim() : "";

  paddle.Checkout.open({
    settings: {
      displayMode: "overlay",
      variant: "multi-page",
      allowLogout: false,
      theme: "light",
    },
    items: [{ priceId: PADDLE_PLUS_PRICE_ID, quantity: 1 }],
    customer: normalizedEmail ? { email: normalizedEmail } : undefined,
    customData: {
      userId: normalizedUserId,
      planId: "plus",
    },
  });
}
