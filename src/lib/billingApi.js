import { getApiUrl } from "./api";
import { getSupabaseClient } from "./supabase";

async function getAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) return "";

  try {
    const { data } = await supabase.auth.getSession();
    return typeof data?.session?.access_token === "string" ? data.session.access_token : "";
  } catch {
    return "";
  }
}

async function readJson(resp) {
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

async function authorizedFetch(path, init) {
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(init?.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  return fetch(getApiUrl(path), {
    ...init,
    headers,
  });
}

export async function fetchBillingEntitlement() {
  const resp = await authorizedFetch("/api/billing/entitlements", { method: "GET" });
  const data = await readJson(resp);

  if (!resp.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `http_${resp.status}`);
  }

  return data;
}

export async function verifyGooglePlayPurchase({ packageName, purchaseToken } = {}) {
  const resp = await authorizedFetch("/api/billing/google-play/verify", {
    method: "POST",
    body: JSON.stringify({ packageName, purchaseToken }),
  });

  const data = await readJson(resp);
  if (!resp.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `http_${resp.status}`);
  }

  return data;
}

export async function createPaddlePortalSession() {
  const resp = await authorizedFetch("/api/billing/paddle/portal", {
    method: "POST",
    body: JSON.stringify({}),
  });

  const data = await readJson(resp);
  if (!resp.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : `http_${resp.status}`);
  }

  return data;
}