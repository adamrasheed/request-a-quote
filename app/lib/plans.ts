export const PRO_PLAN = "Request a Quote Pro";

// Free-tier cap on quote requests. Mirrors the billing config in shopify.server.ts.
export const FREE_QUOTE_LIMIT = 5;

export const PLAN_BILLING = {
  free: { amountCents: 0 },
  pro: { amountCents: 1_900 },
} as const;

export type PlanKey = keyof typeof PLAN_BILLING;

export function isPlanKey(value: string | null | undefined): value is PlanKey {
  return (
    value != null && Object.prototype.hasOwnProperty.call(PLAN_BILLING, value)
  );
}

export const PLANS = [
  {
    key: "free" as const,
    label: "Free",
    price: "$0",
    interval: "",
    description: `Up to ${FREE_QUOTE_LIMIT} quote requests`,
    trial: null as string | null,
    planName: null as string | null,
  },
  {
    key: "pro" as const,
    label: "Pro",
    price: "$19",
    interval: "/month",
    description: "Unlimited quote requests",
    trial: "14-day free trial",
    planName: PRO_PLAN,
    badge: "Most popular",
  },
] as const;
