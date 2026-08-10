import type { QuoteLineRow } from "../types/db";

// Pure quote arithmetic — the totals a quote card, the dashboard, and the
// Draft Order builder all derive from the same source. Money stays in integer
// cents throughout.

export type QuoteTotals = {
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
};

export function lineAmountCents(
  line: Pick<QuoteLineRow, "quantity" | "quoted_unit_price_cents">,
): number {
  const unit = line.quoted_unit_price_cents;
  if (unit == null) return 0;
  return unit * line.quantity;
}

export function isLineQuoted(
  line: Pick<QuoteLineRow, "quoted_unit_price_cents">,
): boolean {
  return line.quoted_unit_price_cents != null;
}

// Every line must carry a quoted unit price AND the merchant must have saved
// pricing (the quote row's `quoted` flag) for the quote to be sendable.
export function isQuoteFullyQuoted(
  lines: Pick<QuoteLineRow, "quoted_unit_price_cents">[],
): boolean {
  return lines.length > 0 && lines.every(isLineQuoted);
}

export function computeQuoteTotals(
  lines: Pick<QuoteLineRow, "quantity" | "quoted_unit_price_cents">[],
): {
  subtotal_cents: number;
} {
  const subtotal_cents = lines.reduce(
    (sum, line) => sum + lineAmountCents(line),
    0,
  );
  return { subtotal_cents };
}

export function computeFinalTotals(input: {
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
}): { total_cents: number } {
  const total_cents = Math.max(
    0,
    input.subtotal_cents -
      input.discount_cents +
      input.shipping_cents +
      input.tax_cents,
  );
  return { total_cents };
}

export function fullQuoteTotals(
  lines: Pick<QuoteLineRow, "quantity" | "quoted_unit_price_cents">[],
  input: Pick<QuoteTotals, "discount_cents" | "shipping_cents" | "tax_cents">,
): QuoteTotals {
  const { subtotal_cents } = computeQuoteTotals(lines);
  const { total_cents } = computeFinalTotals({ ...input, subtotal_cents });
  return { ...input, subtotal_cents, total_cents };
}
