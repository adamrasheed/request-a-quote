import { describe, expect, it } from "vitest";
import {
  computeQuoteTotals,
  computeFinalTotals,
  fullQuoteTotals,
  isQuoteFullyQuoted,
  lineAmountCents,
} from "../quotes";
import { isEntitled, quotesRemaining } from "../access";
import { FREE_QUOTE_LIMIT } from "../plans";

describe("quote totals", () => {
  it("computes line amounts from quoted unit price × quantity", () => {
    expect(
      lineAmountCents({ quantity: 3, quoted_unit_price_cents: 1250 }),
    ).toBe(3750);
    expect(
      lineAmountCents({ quantity: 3, quoted_unit_price_cents: null }),
    ).toBe(0);
  });

  it("sums subtotals across lines", () => {
    const { subtotal_cents } = computeQuoteTotals([
      { quantity: 2, quoted_unit_price_cents: 1000 },
      { quantity: 1, quoted_unit_price_cents: 500 },
    ]);
    expect(subtotal_cents).toBe(2500);
  });

  it("never lets discount push the total below zero", () => {
    const { total_cents } = computeFinalTotals({
      subtotal_cents: 1000,
      discount_cents: 2000,
      shipping_cents: 0,
      tax_cents: 0,
    });
    expect(total_cents).toBe(0);
  });

  it("computes the full total: subtotal - discount + shipping + tax", () => {
    const totals = fullQuoteTotals(
      [
        { quantity: 1, quoted_unit_price_cents: 10000 },
        { quantity: 2, quoted_unit_price_cents: 5000 },
      ],
      { discount_cents: 1000, shipping_cents: 800, tax_cents: 500 },
    );
    expect(totals.subtotal_cents).toBe(20000);
    expect(totals.total_cents).toBe(20300);
  });
});

describe("isQuoteFullyQuoted", () => {
  it("is false for empty or partially-priced quotes", () => {
    expect(isQuoteFullyQuoted([])).toBe(false);
    expect(
      isQuoteFullyQuoted([
        { quoted_unit_price_cents: 1000 },
        { quoted_unit_price_cents: null },
      ]),
    ).toBe(false);
  });

  it("is true when every line is priced", () => {
    expect(
      isQuoteFullyQuoted([
        { quoted_unit_price_cents: 1000 },
        { quoted_unit_price_cents: 500 },
      ]),
    ).toBe(true);
  });
});

describe("free tier entitlement", () => {
  it("is entitled while under the cap on the free tier", () => {
    expect(isEntitled({ billing_active: false }, FREE_QUOTE_LIMIT - 1)).toBe(
      true,
    );
    expect(isEntitled({ billing_active: false }, FREE_QUOTE_LIMIT)).toBe(false);
  });

  it("is always entitled with an active subscription", () => {
    expect(isEntitled({ billing_active: true }, 100)).toBe(true);
  });

  it("reports remaining quotes and never below zero", () => {
    expect(quotesRemaining({ billing_active: false }, 2)).toBe(
      FREE_QUOTE_LIMIT - 2,
    );
    expect(quotesRemaining({ billing_active: false }, 99)).toBe(0);
    expect(quotesRemaining({ billing_active: true }, 99)).toBe(Infinity);
  });
});
