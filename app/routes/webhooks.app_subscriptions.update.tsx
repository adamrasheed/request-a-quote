import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { PRO_PLAN } from "../lib/plans";

type SubscriptionPayload = {
  status: string;
  name: string;
  admin_graphql_api_id: string;
};

function isValidSubscription(s: unknown): s is SubscriptionPayload {
  if (!s || typeof s !== "object") return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.status === "string" &&
    typeof obj.name === "string" &&
    typeof obj.admin_graphql_api_id === "string"
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  const raw = (payload as Record<string, unknown>)?.app_subscription;
  if (!isValidSubscription(raw)) {
    console.error("Invalid app_subscriptions webhook payload:", {
      shop,
      payload,
    });
    return new Response(null, { status: 400 });
  }
  const subscription = raw;

  // PENDING/DECLINED describe a subscription attempt that never became the
  // shop's plan — syncing them would wrongly downgrade an active shop.
  if (subscription.status === "PENDING" || subscription.status === "DECLINED") {
    return new Response(null, { status: 200 });
  }

  const isActive = subscription.status === "ACTIVE";
  const plan = isActive && subscription.name === PRO_PLAN ? "pro" : "free";

  const { data: updated, error } = await supabase
    .from("request_a_quote_shops")
    .update({
      plan,
      billing_active: isActive,
      subscription_id: isActive ? subscription.admin_graphql_api_id : null,
    })
    .eq("shop_domain", shop)
    .select("id");

  if (error) {
    console.error("Failed to update subscription status:", error.message);
    return new Response(null, { status: 500 });
  }
  if (!updated?.length) {
    console.error("Shop not found for subscription update:", shop);
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 200 });
};
