import type { QuoteSettings } from "../types/db";

// Pure product-eligibility logic for the storefront button. Kept free of
// server/DB imports so it can be unit tested and shared with client code.

export type ProductLike = {
  id: string;
};

export function isProductEligible(
  product: ProductLike,
  settings: QuoteSettings,
): boolean {
  if (!settings.enabled) return false;
  if (settings.eligibility.mode !== "whitelist") return true;
  return settings.eligibility.whitelistIds.includes(product.id);
}
