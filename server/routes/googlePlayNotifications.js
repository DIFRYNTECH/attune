import { google } from "googleapis";
import { getGooglePlayBillingConfig } from "../lib/googlePlayBilling.js";
import { processPlayNotification } from "../services/googlePlayService.js";

export async function authenticatePlayNotification(authorization, {
  audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE,
  email = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL,
  client = new google.auth.OAuth2(),
} = {}) {
  if (!audience || !email) throw Object.assign(new Error("google_play_rtdn_not_configured"), { status: 503 });
  const token = typeof authorization === "string" && authorization.match(/^Bearer ([^\s]+)$/)?.[1];
  if (!token) throw Object.assign(new Error("invalid_notification_identity"), { status: 401 });
  try {
    const ticket = await client.verifyIdToken({ idToken: token, audience });
    const payload = ticket.getPayload();
    if (payload?.email !== email || payload.email_verified !== true ||
      !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) throw new Error("wrong_identity");
  } catch {
    throw Object.assign(new Error("invalid_notification_identity"), { status: 401 });
  }
}

export function registerGooglePlayNotificationRoute({ app, supabaseAdmin, logEvent }) {
  app.post("/api/billing/google-play/rtdn", async (req, res) => {
    try {
      await authenticatePlayNotification(req.headers.authorization);
      const data = req.body?.message?.data;
      if (typeof data !== "string" || data.length > 32768) throw Object.assign(new Error("invalid_notification_payload"), { status: 400 });
      let notification;
      try { notification = JSON.parse(Buffer.from(data, "base64").toString("utf8")); }
      catch { throw Object.assign(new Error("invalid_notification_payload"), { status: 400 }); }
      await processPlayNotification({ supabaseAdmin, notification, packageName: getGooglePlayBillingConfig().packageName });
      res.status(204).end();
    } catch (error) {
      const status = [400, 401, 503].includes(error.status) ? error.status : 503;
      // Never log purchase tokens, notification payloads or identity claims.
      logEvent("error", "google_play_notification_failed", { status });
      res.status(status).json({ error: status === 401 ? "unauthorized_notification" : "notification_not_processed" });
    }
  });
}
