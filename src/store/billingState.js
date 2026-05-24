export function defaultBillingState(){
  return {
    planId: "free",
    status: "active",
    source: "manual",
    currentPeriodStart: "",
    currentPeriodEnd: "",
    providerSubscriptionId: "",
    productId: "",
    purchaseStatus: "",
    acknowledged: false,
    syncing: false,
    configuredGooglePlay: false,
    configuredPaddle: false,
    customerPortalAvailable: false,
    error: "",
    lastSyncedAt: 0,
  };
}

export function normalizeBillingState(input){
  const next = input && typeof input === "object" && !Array.isArray(input)
    ? { ...defaultBillingState(), ...input }
    : defaultBillingState();

  next.planId = next.planId === "plus" ? "plus" : "free";
  next.status = typeof next.status === "string" && next.status ? next.status : "active";
  next.source = typeof next.source === "string" && next.source ? next.source : "manual";
  next.currentPeriodStart = typeof next.currentPeriodStart === "string" ? next.currentPeriodStart : "";
  next.currentPeriodEnd = typeof next.currentPeriodEnd === "string" ? next.currentPeriodEnd : "";
  next.providerSubscriptionId = typeof next.providerSubscriptionId === "string" ? next.providerSubscriptionId : "";
  next.productId = typeof next.productId === "string" ? next.productId : "";
  next.purchaseStatus = typeof next.purchaseStatus === "string" ? next.purchaseStatus : "";
  next.acknowledged = next.acknowledged === true;
  next.syncing = next.syncing === true;
  next.configuredGooglePlay = next.configuredGooglePlay === true;
  next.configuredPaddle = next.configuredPaddle === true;
  next.customerPortalAvailable = next.customerPortalAvailable === true;
  next.error = typeof next.error === "string" ? next.error : "";
  next.lastSyncedAt = Number(next.lastSyncedAt) || 0;

  return next;
}

export function getBillingPlanIdFromState(state){
  return state?.billing?.planId === "plus" ? "plus" : "free";
}

export function hasVerifiedPlusNoteMemoryAccess(input){
  const billing = normalizeBillingState(input);
  return billing.planId === "plus" && billing.lastSyncedAt > 0 && !billing.error;
}

export function getBillingErrorMessage(errorCode){
  switch(String(errorCode || "")){
    case "google_play_not_configured":
      return "Google Play billing is not configured yet.";
    case "paddle_not_configured":
      return "Web billing is not configured yet.";
    case "paddle_portal_not_configured":
      return "Billing management is not configured yet.";
    case "paddle_customer_missing":
      return "No web subscription was found for this account.";
    case "play_billing_unavailable":
      return "Google Play billing is only available inside the Android app.";
    case "play_billing_missing_product_id":
      return "Google Play product ID is missing.";
    case "missing_account_id":
      return "Sign in again before starting a purchase.";
    case "purchase_canceled":
      return "Purchase canceled.";
    case "billing_not_ready":
      return "Google Play billing is still connecting. Try again in a moment.";
    case "google_play_verify_failed":
      return "Google Play purchase verification failed.";
    case "paddle_checkout_failed":
      return "Starting web checkout failed.";
    case "paddle_portal_failed":
      return "Opening billing management failed.";
    case "google_play_account_mismatch":
      return "This Google Play purchase belongs to a different Attune account.";
    case "google_play_missing_account_binding":
      return "This purchase is missing the required account binding. Start the upgrade again from this account.";
    case "google_play_purchase_already_linked":
      return "This purchase token is already linked to another Attune account.";
    case "missing_purchase_token":
      return "Google Play did not return a purchase token.";
    default:
      return "Billing is unavailable right now.";
  }
}
