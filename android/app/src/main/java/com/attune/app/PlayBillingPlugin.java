package com.attune.app;

import androidx.annotation.NonNull;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billingClient;
    private final Map<String, ProductDetails> productDetailsCache = new HashMap<>();
    private boolean hasPendingPurchase = false;

    @Override
    public void load() {
        super.load();
        connectBillingClient();
    }

    private void connectBillingClient() {
        if (billingClient != null && billingClient.isReady()) return;

        billingClient = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(
                PendingPurchasesParams.newBuilder()
                    .enableOneTimeProducts()
                    .enablePrepaidPlans()
                    .build()
            )
            .build();

        billingClient.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    productDetailsCache.clear();
                }
            }

            @Override
            public void onBillingServiceDisconnected() {
                productDetailsCache.clear();
            }
        });
    }

    private boolean ensureReady(PluginCall call) {
        if (billingClient != null && billingClient.isReady()) return true;
        connectBillingClient();
        call.reject("billing_not_ready");
        return false;
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        if (!ensureReady(call)) return;

        JSArray productIdsJson = call.getArray("productIds");
        if (productIdsJson == null || productIdsJson.length() == 0) {
          call.reject("missing_product_ids");
          return;
        }

        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (int index = 0; index < productIdsJson.length(); index += 1) {
            String productId = productIdsJson.optString(index, "").trim();
            if (productId.isEmpty()) continue;
            products.add(
                QueryProductDetailsParams.Product.newBuilder()
                    .setProductId(productId)
                    .setProductType(BillingClient.ProductType.SUBS)
                    .build()
            );
        }

        if (products.isEmpty()) {
            call.reject("missing_product_ids");
            return;
        }

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(billingResult.getDebugMessage());
                return;
            }

            List<ProductDetails> productDetailsList = productDetailsResult == null
                ? Collections.emptyList()
                : productDetailsResult.getProductDetailsList();
            JSArray productsJson = new JSArray();
            for (ProductDetails details : productDetailsList) {
                productDetailsCache.put(details.getProductId(), details);
                productsJson.put(toProductJson(details));
            }

            JSObject result = new JSObject();
            result.put("products", productsJson);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        if (!ensureReady(call)) return;

        String productId = call.getString("productId", "").trim();
        String accountId = call.getString("accountId", "").trim();
        if (productId.isEmpty()) {
            call.reject("missing_product_id");
            return;
        }

        if (accountId.isEmpty()) {
            call.reject("missing_account_id");
            return;
        }

        ProductDetails details = productDetailsCache.get(productId);
        if (details != null) {
            launchPurchaseFlow(call, details, accountId);
            return;
        }

        List<QueryProductDetailsParams.Product> products = Collections.singletonList(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.SUBS)
                .build()
        );

        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
            .setProductList(products)
            .build();

        billingClient.queryProductDetailsAsync(params, (billingResult, productDetailsResult) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(billingResult.getDebugMessage());
                return;
            }

            List<ProductDetails> productDetailsList = productDetailsResult == null
                ? Collections.emptyList()
                : productDetailsResult.getProductDetailsList();
            if (productDetailsList == null || productDetailsList.isEmpty()) {
                call.reject("play_billing_product_not_found");
                return;
            }

            ProductDetails fetchedDetails = productDetailsList.get(0);
            productDetailsCache.put(fetchedDetails.getProductId(), fetchedDetails);
            launchPurchaseFlow(call, fetchedDetails, accountId);
        });
    }

    private void launchPurchaseFlow(PluginCall call, ProductDetails details, String accountId) {
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers == null || offers.isEmpty()) {
            call.reject("play_billing_offer_unavailable");
            return;
        }

        ProductDetails.SubscriptionOfferDetails selectedOffer = offers.get(0);

        BillingFlowParams.ProductDetailsParams productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(selectedOffer.getOfferToken())
            .build();

        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setObfuscatedAccountId(accountId)
            .setProductDetailsParamsList(Collections.singletonList(productParams))
            .build();

        call.setKeepAlive(true);
        saveCall(call);
        hasPendingPurchase = true;

        BillingResult result = billingClient.launchBillingFlow(
            getActivity(),
            params
        );

        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            rejectPendingPurchase(result.getDebugMessage());
        }
    }

    @Override
    public void onPurchasesUpdated(@NonNull BillingResult billingResult, List<Purchase> purchases) {
        if (!hasPendingPurchase) return;

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null && !purchases.isEmpty()) {
            PluginCall savedCall = getSavedCall();
            if (savedCall == null) {
                hasPendingPurchase = false;
                return;
            }

            JSArray purchasesJson = new JSArray();
            for (Purchase purchase : purchases) {
                purchasesJson.put(toPurchaseJson(purchase));
            }

            JSObject result = new JSObject();
            result.put("purchases", purchasesJson);
            savedCall.resolve(result);
            hasPendingPurchase = false;
            return;
        }

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            rejectPendingPurchase("purchase_canceled");
            return;
        }

        rejectPendingPurchase(billingResult.getDebugMessage());
    }

    private void rejectPendingPurchase(String message) {
        if (!hasPendingPurchase) return;
        PluginCall savedCall = getSavedCall();
        if (savedCall != null) {
            savedCall.reject(message == null || message.trim().isEmpty() ? "purchase_failed" : message);
        }
        hasPendingPurchase = false;
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        if (!ensureReady(call)) return;

        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.SUBS)
            .build();

        billingClient.queryPurchasesAsync(params, (billingResult, purchases) -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(billingResult.getDebugMessage());
                return;
            }

            JSArray purchasesJson = new JSArray();
            for (Purchase purchase : purchases) {
                purchasesJson.put(toPurchaseJson(purchase));
            }

            JSObject result = new JSObject();
            result.put("purchases", purchasesJson);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void acknowledgePurchase(PluginCall call) {
        if (!ensureReady(call)) return;

        String purchaseToken = call.getString("purchaseToken", "").trim();
        if (purchaseToken.isEmpty()) {
            call.reject("missing_purchase_token");
            return;
        }

        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
            .setPurchaseToken(purchaseToken)
            .build();

        billingClient.acknowledgePurchase(params, billingResult -> {
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                call.reject(billingResult.getDebugMessage());
                return;
            }

            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        });
    }

    private JSObject toProductJson(ProductDetails details) {
        JSObject product = new JSObject();
        product.put("productId", details.getProductId());
        product.put("title", details.getTitle());
        product.put("description", details.getDescription());

        JSArray offersJson = new JSArray();
        List<ProductDetails.SubscriptionOfferDetails> offers = details.getSubscriptionOfferDetails();
        if (offers != null) {
            for (ProductDetails.SubscriptionOfferDetails offer : offers) {
                JSObject offerJson = new JSObject();
                offerJson.put("basePlanId", offer.getBasePlanId());
                offerJson.put("offerId", offer.getOfferId());
                offerJson.put("offerToken", offer.getOfferToken());

                List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                if (phases != null && !phases.isEmpty()) {
                    ProductDetails.PricingPhase phase = phases.get(phases.size() - 1);
                    offerJson.put("formattedPrice", phase.getFormattedPrice());
                    offerJson.put("billingPeriod", phase.getBillingPeriod());
                    offerJson.put("priceAmountMicros", phase.getPriceAmountMicros());
                    offerJson.put("priceCurrencyCode", phase.getPriceCurrencyCode());
                }

                offersJson.put(offerJson);
            }
        }

        product.put("offers", offersJson);
        return product;
    }

    private JSObject toPurchaseJson(Purchase purchase) {
        JSObject purchaseJson = new JSObject();
        purchaseJson.put("orderId", purchase.getOrderId());
        purchaseJson.put("packageName", purchase.getPackageName());
        purchaseJson.put("purchaseToken", purchase.getPurchaseToken());
        purchaseJson.put("acknowledged", purchase.isAcknowledged());
        purchaseJson.put("autoRenewing", purchase.isAutoRenewing());
        purchaseJson.put("purchaseTime", purchase.getPurchaseTime());
        purchaseJson.put("purchaseState", purchase.getPurchaseState());

        JSArray productIds = new JSArray();
        List<String> products = purchase.getProducts();
        if (products != null) {
            for (String productId : products) {
                productIds.put(productId);
            }
        }

        purchaseJson.put("productIds", productIds);
        return purchaseJson;
    }
}
