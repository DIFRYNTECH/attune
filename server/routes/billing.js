import express from "express";

import { getGooglePlayBillingConfig, verifyGooglePlaySubscriptionPurchase } from "../lib/googlePlayBilling.js";
import {
  ensurePaddlePortalConfigured,
  ensurePaddleWebhookConfigured,
  getPaddleBillingConfig,
  paddleApiFetch,
  verifyPaddleWebhookSignature,
} from "../lib/paddleBilling.js";
import { getUserEntitlementState } from "../services/entitlements.js";
import { persistVerifiedPlayPurchase } from "../services/googlePlayService.js";
import {
  findPaddleCustomerByEmail,
  handlePaddleWebhookEvent,
  reconcilePaddleBillingForUser,
  setPaddleCustomerReference,
} from "../services/paddleService.js";

export function registerPaddleWebhookRoute({
  app,
  supabaseAdmin,
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
}) {
  app.post("/api/billing/paddle/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const signature = typeof req.headers["paddle-signature"] === "string" ? req.headers["paddle-signature"] : "";
      ensurePaddleWebhookConfigured();
      verifyPaddleWebhookSignature(req.body, signature);
      const event = JSON.parse(req.body.toString("utf8"));
      await handlePaddleWebhookEvent({ supabaseAdmin, event });
      res.json({ received: true });
    } catch (error) {
      const errorCode = typeof error?.code === "string" ? error.code : "paddle_webhook_invalid";
      setRequestErrorCode(req, errorCode);
      logEvent("error", "paddle_webhook_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        errorCode,
        error: summarizeError(error),
      });
      res.status(400).json({ error: errorCode });
    }
  });
}

export function registerBillingRoutes({
  app,
  supabaseAdmin,
  enforceAllowedOrigin,
  limitBilling,
  requireAuthedUser,
  logEvent,
  summarizeError,
  getRequestLogContext,
  setRequestErrorCode,
  setRequestUserId,
}) {
  app.get("/api/billing/entitlements", enforceAllowedOrigin, limitBilling, async (req, res) => {
    try {
      const authedUser = await requireAuthedUser(req, res);
      if (!authedUser) return;

      const initialEntitlement = await getUserEntitlementState({ supabaseAdmin, userId: authedUser.id });
      if (getPaddleBillingConfig().configured) {
        await reconcilePaddleBillingForUser({
          supabaseAdmin,
          userId: authedUser.id,
          customerId: initialEntitlement.providerCustomerId,
          email: authedUser.email || "",
        }).catch(() => null);
      }

      const entitlement = await getUserEntitlementState({ supabaseAdmin, userId: authedUser.id });
      setRequestUserId(req, authedUser.id);
      res.json({
        entitlement,
        configured: {
          googlePlay: getGooglePlayBillingConfig().configured,
          paddle: getPaddleBillingConfig().configured,
          paddlePortal: getPaddleBillingConfig().portalConfigured,
        },
      });
    } catch (error) {
      setRequestUserId(req, req.attuneRequestLog?.userId || null);
      setRequestErrorCode(req, "billing_entitlement_lookup_failed");
      logEvent("error", "billing_entitlement_lookup_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        error: summarizeError(error),
      });
      res.status(500).json({ error: "billing_entitlement_lookup_failed" });
    }
  });

  app.post("/api/billing/paddle/portal", enforceAllowedOrigin, limitBilling, async (req, res) => {
    try {
      const authedUser = await requireAuthedUser(req, res);
      if (!authedUser) return;
      setRequestUserId(req, authedUser.id);

      ensurePaddlePortalConfigured();

      const entitlement = await getUserEntitlementState({ supabaseAdmin, userId: authedUser.id });
      let customerId = typeof entitlement.providerCustomerId === "string" ? entitlement.providerCustomerId.trim() : "";
      if (!customerId && authedUser.email) {
        const customer = await findPaddleCustomerByEmail(authedUser.email).catch(() => null);
        customerId = typeof customer?.id === "string" ? customer.id : "";
        if (customerId) {
          await setPaddleCustomerReference({ supabaseAdmin, userId: authedUser.id, customerId }).catch(() => null);
        }
      }

      if (!customerId) {
        const error = new Error("paddle_customer_missing");
        error.code = "paddle_customer_missing";
        throw error;
      }

      const payload = entitlement.providerSubscriptionId
        ? { subscription_ids: [entitlement.providerSubscriptionId] }
        : undefined;
      const session = await paddleApiFetch(`/customers/${customerId}/portal-sessions`, {
        method: "POST",
        body: payload,
      });

      res.json({ ok: true, url: session?.data?.urls?.general?.overview || session?.data?.url || null });
    } catch (error) {
      const errorCode = typeof error?.code === "string" ? error.code : "paddle_portal_failed";
      setRequestErrorCode(req, errorCode);
      logEvent("error", "paddle_portal_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(error),
      });
      res.status(errorCode === "paddle_portal_not_configured" ? 503 : 400).json({ error: errorCode });
    }
  });

  app.post("/api/billing/google-play/verify", enforceAllowedOrigin, limitBilling, async (req, res) => {
    try {
      const authedUser = await requireAuthedUser(req, res);
      if (!authedUser) return;
      setRequestUserId(req, authedUser.id);

      const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
      const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken.trim() : "";
      const packageName = typeof body.packageName === "string" ? body.packageName.trim() : "";

      if (!purchaseToken) {
        setRequestErrorCode(req, "missing_purchase_token");
        res.status(400).json({ error: "missing_purchase_token" });
        return;
      }

      const verification = await verifyGooglePlaySubscriptionPurchase({
        packageName,
        purchaseToken,
      });

      if (!verification.obfuscatedExternalAccountId) {
        const error = new Error("google_play_missing_account_binding");
        error.code = "google_play_missing_account_binding";
        throw error;
      }

      if (verification.obfuscatedExternalAccountId !== authedUser.id) {
        const error = new Error("google_play_account_mismatch");
        error.code = "google_play_account_mismatch";
        throw error;
      }

      await persistVerifiedPlayPurchase({ supabaseAdmin, userId: authedUser.id, verification });

      const entitlement = await getUserEntitlementState({ supabaseAdmin, userId: authedUser.id });

      logEvent("info", "billing_google_play_verified", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: authedUser.id,
        productId: verification.productId,
        planId: verification.planId,
        status: verification.status,
        acknowledged: verification.acknowledged,
      });

      res.json({
        ok: true,
        entitlement,
        purchase: {
          productId: verification.productId,
          packageName: verification.packageName,
          purchaseToken: verification.purchaseToken,
          acknowledged: verification.acknowledged,
          currentPeriodEnd: verification.currentPeriodEnd,
          status: verification.status,
        },
      });
    } catch (error) {
      const errorCode = typeof error?.code === "string" ? error.code : "google_play_verify_failed";
      setRequestErrorCode(req, errorCode);
      logEvent("error", "billing_google_play_verify_failed", {
        requestId: getRequestLogContext(req).requestId,
        route: req.path,
        userId: getRequestLogContext(req).userId,
        errorCode,
        error: summarizeError(error),
      });

      const status = errorCode === "google_play_not_configured"
        ? 503
        : errorCode === "missing_purchase_token"
          || errorCode === "google_play_product_not_allowed"
          || errorCode === "google_play_package_name_mismatch"
          || errorCode === "google_play_missing_account_binding"
          || errorCode === "google_play_account_mismatch"
          || errorCode === "google_play_purchase_already_linked"
          ? 400
          : 502;

      res.status(status).json({ error: errorCode });
    }
  });
}
