import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";

import { authenticate } from "../shopify.server";
import {
  claimDraftOrderCreation,
  getQuote,
  recordDraftOrderSent,
  releaseDraftOrderClaim,
  savePricing,
  updateQuoteStatus,
} from "../lib/quotes.server";
import {
  createDraftOrderFromQuote,
  sendDraftOrderInvoice,
} from "../lib/draft-orders.server";
import { formatCurrency, numberToCents, centsToNumber } from "../lib/money";
import { fullQuoteTotals } from "../lib/quotes";
import { track } from "../lib/analytics.server";
import type { QuoteStatus } from "../types/db";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const id = params.id as string;

  const quote = await getQuote(session.shop, id);
  if (!quote) throw new Response("Quote not found", { status: 404 });

  const totals = fullQuoteTotals(quote.lines, {
    discount_cents: quote.discount_cents ?? 0,
    shipping_cents: quote.shipping_cents ?? 0,
    tax_cents: quote.tax_cents ?? 0,
  });

  return {
    quote: {
      ...quote,
      lines: quote.lines.map((l) => ({
        ...l,
        quoted_unit_price_cents: l.quoted_unit_price_cents,
      })),
      totals,
    },
  };
};

export const action = async ({ request, params }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;
  const id = params.id as string;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save_pricing") {
    const linesRaw = JSON.parse((formData.get("lines") as string) || "[]");
    if (
      !Array.isArray(linesRaw) ||
      !linesRaw.every((l) => l && typeof l === "object")
    ) {
      return { error: "Invalid line items." };
    }
    const lines = (linesRaw as Array<Record<string, unknown>>).map((l) => ({
      id: String(l.id),
      quoted_unit_price_cents: numberToCents(Number(l.quoted_unit_price)),
    }));
    const discount_cents = numberToCents(Number(formData.get("discount")) || 0);
    const shipping_cents = numberToCents(Number(formData.get("shipping")) || 0);

    const result = await savePricing(shop, id, {
      lines,
      discount_cents,
      shipping_cents,
    });
    if (!result.ok) return { error: result.error };
    track(shop, "quote_pricing_saved", { quote_id: id });
    return { success: "Pricing saved" };
  }

  if (intent === "send_quote") {
    const quote = await getQuote(shop, id);
    if (!quote) return { error: "Quote not found." };
    if (!quote.quoted)
      return { error: "Price every line before sending the quote." };

    // Only one draft-order creation may run: claim, then release on any
    // failure so the merchant can retry.
    const claim = await claimDraftOrderCreation(shop, id);
    if (!claim.ok) return { error: claim.error };

    const created = await createDraftOrderFromQuote(
      admin.graphql,
      quote,
      quote.currency || "USD",
    );
    if (!created.ok) {
      await releaseDraftOrderClaim(shop, id);
      return { error: created.error };
    }

    const invoice = await sendDraftOrderInvoice(
      admin.graphql,
      created.draftOrderId,
      quote.customer_email,
    );
    if (!invoice.ok) {
      await releaseDraftOrderClaim(shop, id);
      return { error: invoice.error };
    }

    const statusResult = await recordDraftOrderSent(shop, id, {
      id: created.draftOrderId,
      name: created.draftOrderName,
    });
    if (!statusResult.ok) {
      await releaseDraftOrderClaim(shop, id);
      return { error: statusResult.error };
    }

    track(shop, "quote_sent", {
      quote_id: id,
      draft_order_id: created.draftOrderId,
    });
    return {
      success: `Quote sent. Draft order ${created.draftOrderName} created and invoiced to ${quote.customer_email}.`,
      draftOrderId: created.draftOrderId,
    };
  }

  if (intent === "mark_accepted" || intent === "mark_declined") {
    const status = intent === "mark_accepted" ? "accepted" : "declined";
    const result = await updateQuoteStatus(shop, id, status);
    if (!result.ok) return { error: result.error };
    track(shop, `quote_${status}`, { quote_id: id });
    return { success: `Quote marked as ${status}.` };
  }

  if (intent === "archive") {
    const result = await updateQuoteStatus(shop, id, "archived");
    if (!result.ok) return { error: result.error };
    return { success: "Quote archived." };
  }

  return { error: "Unknown intent." };
};

const STATUS_TONE: Record<
  QuoteStatus,
  "info" | "caution" | "warning" | "success" | "critical" | "neutral"
> = {
  new: "info",
  in_progress: "caution",
  sent: "warning",
  accepted: "success",
  declined: "critical",
  archived: "neutral",
};

export default function QuoteDetailPage() {
  const { quote } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const line of quote.lines) {
      initial[line.id] =
        line.quoted_unit_price_cents != null
          ? centsToNumber(line.quoted_unit_price_cents).toFixed(2)
          : "";
    }
    return initial;
  });
  const [discount, setDiscount] = useState(
    centsToNumber(quote.discount_cents).toFixed(2),
  );
  const [shipping, setShipping] = useState(
    centsToNumber(quote.shipping_cents).toFixed(2),
  );

  const totals = fullQuoteTotals(
    quote.lines.map((l) => ({
      ...l,
      quoted_unit_price_cents: numberToCents(Number(prices[l.id]) || 0),
    })),
    {
      discount_cents: numberToCents(Number(discount) || 0),
      shipping_cents: numberToCents(Number(shipping) || 0),
      tax_cents: quote.tax_cents ?? 0,
    },
  );

  const isSaving = fetcher.state !== "idle";

  useEffect(() => {
    if (!fetcher.data) return;
    if ("success" in fetcher.data) {
      shopify.toast.show(fetcher.data.success as string);
    } else if ("error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  function submit(intent: string, extra?: Record<string, string>) {
    const data = new FormData();
    data.set("intent", intent);
    if (intent === "save_pricing") {
      const lines = quote.lines.map((line) => ({
        id: line.id,
        quoted_unit_price: prices[line.id] ?? "",
      }));
      data.set("lines", JSON.stringify(lines));
      data.set("discount", discount);
      data.set("shipping", shipping);
    }
    for (const [k, v] of Object.entries(extra ?? {})) data.set(k, v);
    fetcher.submit(data, { method: "POST" });
  }

  return (
    <s-page heading={`Quote #${quote.quote_number}`}>
      <s-badge tone={STATUS_TONE[quote.status] ?? "neutral"}>
        {quote.status.replace("_", " ")}
      </s-badge>

      <s-section heading="Customer">
        <s-stack direction="block" gap="small">
          <s-text>
            {quote.customer_name}
            {quote.customer_company ? ` · ${quote.customer_company}` : ""}
          </s-text>
          <s-text color="subdued">
            <s-link href={`mailto:${quote.customer_email}`}>
              {quote.customer_email}
            </s-link>
            {quote.customer_phone ? ` · ${quote.customer_phone}` : ""}
          </s-text>
          {quote.notes && (
            <s-paragraph>
              <s-text color="subdued">Notes: </s-text>
              {quote.notes}
            </s-paragraph>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Items">
        <s-stack direction="block" gap="small">
          {quote.lines.map((line) => (
            <s-box
              key={line.id}
              border="base"
              borderRadius="base"
              padding="base"
            >
              <s-grid
                gridTemplateColumns="1fr auto"
                gap="base"
                alignItems="start"
              >
                <s-stack direction="block" gap="small">
                  <s-text>{line.product_title}</s-text>
                  <s-text color="subdued">
                    {line.variant_title || "Default"}{" "}
                    {line.sku ? `· SKU ${line.sku}` : ""}
                  </s-text>
                  <s-text color="subdued">Qty: {line.quantity}</s-text>
                </s-stack>
                <s-stack direction="block" gap="small">
                  <label htmlFor={`price-${line.id}`}>
                    <s-text color="subdued">Unit price</s-text>
                  </label>
                  <input
                    id={`price-${line.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={prices[line.id] ?? ""}
                    onChange={(e) =>
                      setPrices((prev) => ({
                        ...prev,
                        [line.id]: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    style={{
                      padding: "8px 12px",
                      border: "1px solid #c9cccf",
                      borderRadius: "4px",
                      fontSize: "14px",
                      width: "120px",
                    }}
                  />
                </s-stack>
              </s-grid>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Totals">
        <s-stack direction="block" gap="small">
          <s-stack direction="inline" gap="base">
            <label htmlFor="discount">
              <s-text color="subdued">Discount</s-text>
            </label>
            <input
              id="discount"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                fontSize: "14px",
                width: "120px",
              }}
            />
            <label htmlFor="shipping">
              <s-text color="subdued">Shipping</s-text>
            </label>
            <input
              id="shipping"
              type="number"
              step="0.01"
              min="0"
              value={shipping}
              onChange={(e) => setShipping(e.target.value)}
              style={{
                padding: "8px 12px",
                border: "1px solid #c9cccf",
                borderRadius: "4px",
                fontSize: "14px",
                width: "120px",
              }}
            />
          </s-stack>
          <s-text>
            Subtotal:{" "}
            {formatCurrency(totals.subtotal_cents, {
              currencyCode: quote.currency,
            })}
          </s-text>
          {totals.discount_cents > 0 && (
            <s-text>
              Discount: -
              {formatCurrency(totals.discount_cents, {
                currencyCode: quote.currency,
              })}
            </s-text>
          )}
          {totals.shipping_cents > 0 && (
            <s-text>
              Shipping:{" "}
              {formatCurrency(totals.shipping_cents, {
                currencyCode: quote.currency,
              })}
            </s-text>
          )}
          {totals.tax_cents > 0 && (
            <s-text>
              Tax:{" "}
              {formatCurrency(totals.tax_cents, {
                currencyCode: quote.currency,
              })}
            </s-text>
          )}
          <s-heading>
            Total:{" "}
            {formatCurrency(totals.total_cents, {
              currencyCode: quote.currency,
            })}
          </s-heading>
        </s-stack>
      </s-section>

      <s-section heading="Actions">
        <s-button
          onClick={() => submit("save_pricing")}
          {...(isSaving ? { loading: true } : {})}
        >
          Save pricing
        </s-button>
        <s-button
          variant="primary"
          onClick={() => submit("send_quote")}
          {...(isSaving ? { loading: true } : {})}
          disabled={!quote.quoted && !pricesAreFilled(quote.lines, prices)}
        >
          Send quote to customer
        </s-button>
        <s-button onClick={() => submit("mark_accepted")} variant="secondary">
          Mark accepted
        </s-button>
        <s-button onClick={() => submit("mark_declined")} variant="secondary">
          Mark declined
        </s-button>
        <s-button onClick={() => submit("archive")} variant="tertiary">
          Archive
        </s-button>
      </s-section>
    </s-page>
  );
}

function pricesAreFilled(
  lines: Array<{ id: string }>,
  prices: Record<string, string>,
): boolean {
  return (
    lines.length > 0 &&
    lines.every((line) => {
      const value = prices[line.id];
      return (
        value !== undefined && value !== "" && Number.isFinite(Number(value))
      );
    })
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
