import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { supabase } from "../lib/supabase.server";
import { track } from "../lib/analytics.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session } = await authenticate.webhook(request);

  // Claim the install→uninstall transition exactly once, BEFORE deactivation.
  // Shopify delivers this webhook more than once; filtering on `uninstalled_at
  // IS NULL` and checking that a row actually changed means only the first
  // delivery wins.
  const { data: claimed, error: claimError } = await supabase
    .from("request_a_quote_shops")
    .update({ uninstalled_at: new Date().toISOString() })
    .eq("shop_domain", shop)
    .is("uninstalled_at", null)
    .select("id, plan, billing_active");

  if (claimError) {
    console.error("Failed to stamp uninstalled_at:", claimError.message);
    return new Response(null, { status: 500 });
  }

  if (claimed?.[0]) {
    track(shop, "app_uninstalled", {
      plan: claimed[0].plan ?? "free",
      billing_active: claimed[0].billing_active ?? false,
    });
  }

  // Deactivate billing — retain quotes/data in case the merchant reinstalls.
  const { data: updatedShop, error: shopError } = await supabase
    .from("request_a_quote_shops")
    .update({ billing_active: false, plan: "free", subscription_id: null })
    .eq("shop_domain", shop)
    .select("id");

  if (shopError) {
    console.error("Failed to deactivate shop on uninstall:", shopError.message);
    return new Response(null, { status: 500 });
  } else if (!updatedShop?.length) {
    console.error("Shop not found on uninstall:", shop);
  }

  if (session) {
    const { error: sessionError } = await supabase
      .from("request_a_quote_sessions")
      .delete()
      .eq("shop_domain", shop)
      .select("id");
    if (sessionError) {
      console.error(
        "Failed to delete sessions on uninstall:",
        sessionError.message,
      );
      return new Response(null, { status: 500 });
    }
  }

  return new Response(null, { status: 200 });
};
