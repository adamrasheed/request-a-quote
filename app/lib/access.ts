import { FREE_QUOTE_LIMIT } from "./plans";

// Free tier: a shop is entitled while it has an ACTIVE subscription, or while
// it has not yet hit the free quote-request cap. Shopify marks a subscription
// ACTIVE from approval through the trial, so `billing_active` alone is the
// paid signal and `quotesUsed` (the count of non-archived quotes) answers the
// free-tier question.
export function isEntitled(
  shop: { billing_active: boolean | null },
  quotesUsed: number,
): boolean {
  if (shop.billing_active === true) return true;
  return quotesUsed < FREE_QUOTE_LIMIT;
}

export function quotesRemaining(
  shop: { billing_active: boolean | null },
  quotesUsed: number,
): number {
  if (shop.billing_active === true) return Infinity;
  return Math.max(0, FREE_QUOTE_LIMIT - quotesUsed);
}
