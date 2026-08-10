export type CurrencyCode = string;

// Money is stored as INTEGER minor units (`*_cents`) — never floating point.
// This module owns the conversion between integer cents and the decimal
// strings / formatted output every boundary needs.

export function centsToNumber(cents: number | null | undefined): number {
  if (cents == null) return 0;
  return cents / 100;
}

export function numberToCents(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

export function formatCurrency(
  amountCents: number | null | undefined,
  {
    currencyCode = "USD",
    locale = "en-US",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  }: {
    currencyCode?: CurrencyCode;
    locale?: string;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  } = {},
) {
  const n = centsToNumber(amountCents);
  if (!Number.isFinite(n)) return "—";

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(n);
  } catch {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits,
      maximumFractionDigits,
    }).format(n);
  }
}

// Shopify GraphQL money fields are decimal strings like "12.34" or "19.00".
// Parse one to integer cents without floating-point drift.
export function decimalToCents(
  decimal: string | number | null | undefined,
): number {
  if (decimal == null) return 0;
  const n = typeof decimal === "number" ? decimal : Number(decimal);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

// Integer cents to a GraphQL-safe decimal string (e.g. 1234 -> "12.34").
export function centsToDecimal(cents: number | null | undefined): string {
  const c = Number.isFinite(cents) ? Math.round(cents as number) : 0;
  return (c / 100).toFixed(2);
}
