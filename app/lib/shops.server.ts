import { supabase } from "./supabase.server";
import type { ShopRow } from "../types/db";
import { normalizeSettings } from "./settings";

// One row per installed shop. `shop_domain` is the tenant key every other
// table scopes by. The row survives uninstall (kept for reinstalls).

export async function getShopRow(shop: string): Promise<ShopRow | null> {
  const { data, error } = await supabase
    .from("request_a_quote_shops")
    .select("*")
    .eq("shop_domain", shop)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("getShopRow error:", error.message);
    throw new Error(`Failed to load shop row for ${shop}`);
  }
  return { ...(data as ShopRow), settings: normalizeSettings(data.settings) };
}

export async function ensureShopExists(shop: string): Promise<void> {
  const { error } = await supabase
    .from("request_a_quote_shops")
    .upsert(
      { shop_domain: shop },
      { onConflict: "shop_domain", ignoreDuplicates: true },
    );
  if (error) {
    console.error("ensureShopExists error:", error.message);
    throw new Error(`Failed to ensure shop row for ${shop}`);
  }
}

export async function markShopInstalled(
  shop: string,
): Promise<"new" | "reinstall" | "existing"> {
  const { data: existing, error: readError } = await supabase
    .from("request_a_quote_shops")
    .select("shop_domain, uninstalled_at")
    .eq("shop_domain", shop)
    .single();

  if (readError && readError.code !== "PGRST116") {
    console.error("markShopInstalled read error:", readError.message);
    throw new Error(`Failed to read shop row for ${shop}`);
  }

  if (existing) {
    if (existing.uninstalled_at) {
      const { error: updateError } = await supabase
        .from("request_a_quote_shops")
        .update({
          uninstalled_at: null,
          installed_at: new Date().toISOString(),
        })
        .eq("shop_domain", shop)
        .select("id");
      if (updateError)
        throw new Error(`Failed to reinstall shop row for ${shop}`);
      return "reinstall";
    }
    return "existing"; // already installed — afterAuth ran again on app open
  }

  const { error: insertError } = await supabase
    .from("request_a_quote_shops")
    .insert({ shop_domain: shop })
    .select("id");
  if (insertError) throw new Error(`Failed to create shop row for ${shop}`);
  return "new";
}
