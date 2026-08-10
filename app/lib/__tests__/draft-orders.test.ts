import { describe, expect, it } from "vitest";
import { buildDraftOrderInput } from "../draft-orders.server";
import type { QuoteWithLines } from "../../types/db";

function makeQuote(overrides: Partial<QuoteWithLines> = {}): QuoteWithLines {
  return {
    id: "q1",
    shop_domain: "shop.myshopify.com",
    quote_number: 7,
    status: "in_progress",
    customer_name: "Jane",
    customer_email: "jane@example.com",
    customer_company: null,
    customer_phone: null,
    customer_id: null,
    notes: "Please rush",
    currency: "USD",
    subtotal_cents: 2000,
    discount_cents: 0,
    shipping_cents: 0,
    tax_cents: 0,
    total_cents: 2000,
    quoted: true,
    draft_order_id: null,
    draft_order_name: null,
    draft_order_created_at: null,
    draft_order_claim_at: null,
    invoice_sent_at: null,
    accepted_at: null,
    declined_at: null,
    archived_at: null,
    internal_notes: null,
    client_request_id: null,
    notification_status: null,
    notification_error: null,
    notification_attempts: 0,
    submitted_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    lines: [
      {
        id: "l1",
        shop_domain: "shop.myshopify.com",
        quote_id: "q1",
        position: 0,
        product_id: "gid://shopify/Product/1",
        variant_id: "gid://shopify/ProductVariant/1",
        product_title: "Widget",
        variant_title: "Large",
        sku: "W-1",
        quantity: 2,
        original_price_cents: 1500,
        quoted_unit_price_cents: 1000,
        image_url: null,
        product_url: null,
        selected_options: [],
        custom_properties: [],
        created_at: "2026-01-01T00:00:00Z",
      },
    ],
    ...overrides,
  };
}

describe("buildDraftOrderInput", () => {
  it("maps quoted prices to originalUnitPrice with quantity", () => {
    const input = buildDraftOrderInput(makeQuote(), "USD");
    expect(input.lineItems).toEqual([
      {
        variantId: "gid://shopify/ProductVariant/1",
        quantity: 2,
        originalUnitPrice: "10.00",
      },
    ]);
  });

  it("sends customer email and note", () => {
    const input = buildDraftOrderInput(makeQuote(), "USD");
    expect(input.email).toBe("jane@example.com");
    expect(input.note).toBe("Please rush");
  });

  it("tags the draft order with the quote number", () => {
    const input = buildDraftOrderInput(makeQuote(), "USD");
    expect(input.tags).toContain("quote-7");
  });
});
