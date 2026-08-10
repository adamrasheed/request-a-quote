import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { BillingError } from "@shopify/shopify-api";

import { authenticate } from "../shopify.server";
import { PRO_PLAN, PLANS, FREE_QUOTE_LIMIT } from "../lib/plans";
import { supabase } from "../lib/supabase.server";
import { countActiveQuotes } from "../lib/quotes.server";
import { track } from "../lib/analytics.server";

type ShopRow = {
  plan: string | null;
  billing_active: boolean | null;
  subscription_id: string | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);

  const activated = new URL(request.url).searchParams.get("success") === "true";

  if (activated) {
    const isTest = process.env.NODE_ENV !== "production";
    const { hasActivePayment, appSubscriptions } = await billing.check({
      plans: [PRO_PLAN],
      isTest,
    });
    if (hasActivePayment && appSubscriptions.length > 0) {
      const sub = appSubscriptions[0];
      const { error: subError } = await supabase
        .from("request_a_quote_shops")
        .update({
          plan: "pro",
          billing_active: true,
          subscription_id: sub.id,
        })
        .eq("shop_domain", session.shop)
        .select("id");
      if (subError)
        console.error("Failed to sync billing status:", subError.message);
    }
  }

  const { data: shop, error } = await supabase
    .from("request_a_quote_shops")
    .select("plan, billing_active, subscription_id")
    .eq("shop_domain", session.shop)
    .single();

  if (error) throw new Error(error.message);
  if (!shop) throw new Error("Shop not found. Try reinstalling the app.");

  const activeCount = await countActiveQuotes(session.shop);

  return { shop: shop as ShopRow, activated, activeCount };
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "upgrade") {
    const isTest = process.env.NODE_ENV !== "production";
    track(session.shop, "upgrade_clicked", { plan: "pro" });
    try {
      return await billing.request({
        plan: PRO_PLAN,
        isTest,
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/billing?success=true&plan=${encodeURIComponent(PRO_PLAN)}`,
      });
    } catch (err) {
      if (err instanceof Response) throw err;
      if (err instanceof BillingError) {
        return {
          error:
            "You declined the subscription. You can subscribe again at any time.",
        };
      }
      return { error: "Billing request failed. Please try again." };
    }
  }

  if (intent === "cancel") {
    const { data: shop, error: shopError } = await supabase
      .from("request_a_quote_shops")
      .select("subscription_id")
      .eq("shop_domain", session.shop)
      .single();

    if (shopError) return { error: shopError.message };
    if (!shop?.subscription_id)
      return { error: "No active subscription found." };

    const isTest = process.env.NODE_ENV !== "production";
    try {
      await billing.cancel({
        subscriptionId: shop.subscription_id,
        isTest,
        prorate: true,
      });
    } catch {
      return { error: "Failed to cancel subscription. Please try again." };
    }

    const result = await syncBillingState(session.shop, {
      plan: "free",
      billing_active: false,
      subscription_id: null,
    });
    if (!result.ok) return { error: "Failed to update billing status." };
    return { success: true };
  }

  return { error: "Unknown intent." };
};

async function syncBillingState(
  shop: string,
  next: {
    plan: string;
    billing_active: boolean;
    subscription_id: string | null;
  },
): Promise<{ ok: boolean }> {
  const { error } = await supabase
    .from("request_a_quote_shops")
    .update(next)
    .eq("shop_domain", shop)
    .select("id");
  return { ok: !error };
}

export default function BillingPage() {
  const { shop, activated, activeCount } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [billingError, setBillingError] = useState<string | null>(null);

  const isActive = shop.billing_active === true;
  const isOnPaidPlan = isActive && shop.plan === "pro";
  const isCancelling =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "cancel";

  useEffect(() => {
    if (!fetcher.data) return;
    if ("success" in fetcher.data) {
      shopify.toast.show("Subscription cancelled");
      setBillingError(null);
    } else if ("error" in fetcher.data) {
      const msg = fetcher.data.error as string;
      setBillingError(msg);
      shopify.toast.show(msg, { isError: true });
    }
  }, [fetcher.data, shopify]);

  function upgrade() {
    const data = new FormData();
    data.set("intent", "upgrade");
    fetcher.submit(data, { method: "POST" });
  }

  function cancel() {
    const data = new FormData();
    data.set("intent", "cancel");
    fetcher.submit(data, { method: "POST" });
  }

  return (
    <s-page heading="Billing">
      {activated && (
        <s-banner tone="success">
          <s-paragraph>
            Your Pro plan is active. Enjoy unlimited quote requests!
          </s-paragraph>
        </s-banner>
      )}

      {billingError && (
        <s-banner tone="critical">
          <s-paragraph>{billingError}</s-paragraph>
        </s-banner>
      )}

      <s-section heading="Current plan">
        <s-stack direction="inline" gap="base">
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Plan</s-text>
            <s-text>{shop.plan === "pro" ? "Pro" : "Free"}</s-text>
          </s-stack>
          <s-stack direction="block" gap="small">
            <s-text color="subdued">Status</s-text>
            <s-badge tone={isActive ? "success" : "neutral"}>
              {isActive ? "Active" : "Free"}
            </s-badge>
          </s-stack>
        </s-stack>

        {isOnPaidPlan ? (
          <s-stack direction="block" gap="small">
            <s-button
              variant="tertiary"
              onClick={cancel}
              {...(isCancelling ? { loading: true } : {})}
            >
              Cancel subscription
            </s-button>
            <s-text color="subdued">
              Cancelling will downgrade you to the free plan at the end of your
              billing period.
            </s-text>
          </s-stack>
        ) : (
          <s-paragraph>
            You&apos;ve used {activeCount} of {FREE_QUOTE_LIMIT} free quote
            requests. Upgrade to Pro for unlimited quote requests.
          </s-paragraph>
        )}
      </s-section>

      <s-section heading="Plans">
        <s-stack direction="inline" gap="base">
          {PLANS.map((plan) => {
            const isCurrent = shop.plan === plan.key;
            return (
              <div
                key={plan.key}
                style={{
                  flex: "1",
                  border: isCurrent ? "2px solid #303030" : "1px solid #e4e5e7",
                  borderRadius: "8px",
                  padding: "20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  position: "relative",
                }}
              >
                {"badge" in plan && (
                  <span
                    style={{
                      position: "absolute",
                      top: "-12px",
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "#303030",
                      color: "#fff",
                      fontSize: "11px",
                      fontWeight: "700",
                      padding: "2px 10px",
                      borderRadius: "12px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plan.badge}
                  </span>
                )}

                <div style={{ fontSize: "16px", fontWeight: "700" }}>
                  {plan.label}
                </div>
                <div>
                  <span style={{ fontSize: "28px", fontWeight: "700" }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: "14px", color: "#6d7175" }}>
                    {plan.interval}
                  </span>
                </div>
                <div style={{ fontSize: "14px", color: "#6d7175" }}>
                  {plan.description}
                </div>
                {plan.trial && (
                  <div style={{ fontSize: "13px", color: "#1a4b3a" }}>
                    {plan.trial}
                  </div>
                )}

                {isCurrent ? (
                  <span
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "#6d7175",
                      marginTop: "8px",
                    }}
                  >
                    Current plan
                  </span>
                ) : plan.key === "pro" ? (
                  <div style={{ marginTop: "8px" }}>
                    <s-button onClick={upgrade}>Upgrade to Pro</s-button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
