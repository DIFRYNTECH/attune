import crypto from "node:crypto";

const PADDLE_API_BASE_URL = "https://api.paddle.com";
const PADDLE_API_VERSION = "1";

const paddleConfig = {
  apiKey: String(process.env.PADDLE_API_KEY || "").trim(),
  webhookSecret: String(process.env.PADDLE_WEBHOOK_SECRET || "").trim(),
  plusPriceId: String(process.env.PADDLE_PLUS_PRICE_ID || "").trim(),
};

export function getPaddleBillingConfig() {
  return {
    configured: !!paddleConfig.apiKey && !!paddleConfig.plusPriceId,
    portalConfigured: !!paddleConfig.apiKey,
    webhookConfigured: !!paddleConfig.webhookSecret,
    plusPriceId: paddleConfig.plusPriceId,
    webhookSecret: paddleConfig.webhookSecret,
  };
}

function buildHeaders(extraHeaders) {
  return {
    Authorization: `Bearer ${paddleConfig.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
    "Paddle-Version": PADDLE_API_VERSION,
    ...(extraHeaders || {}),
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function paddleApiFetch(path, { method = "GET", searchParams, body } = {}) {
  if (!paddleConfig.apiKey) {
    const error = new Error("paddle_not_configured");
    error.code = "paddle_not_configured";
    throw error;
  }

  const url = new URL(`${PADDLE_API_BASE_URL}${path}`);
  if (searchParams && typeof searchParams === "object") {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: buildHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await readJson(response);
  if (!response.ok) {
    const errorCode = typeof payload?.error?.type === "string"
      ? payload.error.type
      : typeof payload?.error_code === "string"
        ? payload.error_code
        : `paddle_http_${response.status}`;
    const error = new Error(errorCode);
    error.code = errorCode;
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

export function ensurePaddlePortalConfigured() {
  const config = getPaddleBillingConfig();
  if (!config.portalConfigured) {
    const error = new Error("paddle_portal_not_configured");
    error.code = "paddle_portal_not_configured";
    throw error;
  }
  return config;
}

export function ensurePaddleWebhookConfigured() {
  const config = getPaddleBillingConfig();
  if (!config.webhookConfigured) {
    const error = new Error("paddle_webhook_not_configured");
    error.code = "paddle_webhook_not_configured";
    throw error;
  }
  return config;
}

function parseSignatureHeader(value) {
  const header = String(value || "").trim();
  const parts = header.split(";");
  const signatures = [];
  let timestamp = "";

  for (const part of parts) {
    const [rawKey, rawVal] = part.split("=");
    const key = String(rawKey || "").trim();
    const val = String(rawVal || "").trim();
    if (!key || !val) continue;
    if (key === "ts") timestamp = val;
    if (key === "h1") signatures.push(val);
  }

  return { timestamp, signatures };
}

export function verifyPaddleWebhookSignature(rawBody, signatureHeader) {
  const { webhookSecret } = ensurePaddleWebhookConfigured();
  const { timestamp, signatures } = parseSignatureHeader(signatureHeader);
  if (!timestamp || !signatures.length || !Buffer.isBuffer(rawBody)) {
    const error = new Error("paddle_webhook_invalid");
    error.code = "paddle_webhook_invalid";
    throw error;
  }

  const toleranceSeconds = 30;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const eventSeconds = Number(timestamp);
  if (!Number.isFinite(eventSeconds) || Math.abs(nowSeconds - eventSeconds) > toleranceSeconds) {
    const error = new Error("paddle_webhook_expired");
    error.code = "paddle_webhook_expired";
    throw error;
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}:${rawBody.toString("utf8")}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const matched = signatures.some((signature) => {
    try {
      const actualBuffer = Buffer.from(signature, "hex");
      return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });

  if (!matched) {
    const error = new Error("paddle_webhook_invalid");
    error.code = "paddle_webhook_invalid";
    throw error;
  }
}
