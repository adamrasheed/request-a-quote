import type { AdminGraphqlClient } from "@shopify/shopify-app-react-router/server";
import type { QuoteLineRow, QuoteWithLines } from "../types/db";
import { centsToDecimal } from "./money";
import {
  CREATE_DRAFT_ORDER,
  SEND_DRAFT_ORDER_INVOICE,
} from "./shopify-operations.server";
import type {
  DraftOrderCreateData,
  DraftOrderInvoiceSendData,
  GraphqlResult,
} from "../types/graphql";

// Convert a fully-quoted quote into a Shopify Draft Order and send the invoice
// to the customer. This is the merchant-facing "send quote" action: the draft
// order line items carry the quoted unit prices via `originalUnitPrice`, and
// `draftOrderInvoiceSend` emails the customer a link to review and pay.

export function buildDraftOrderInput(
  quote: QuoteWithLines,
  shopCurrency: string,
) {
  const lineItems = quote.lines.map((line: QuoteLineRow) => ({
    variantId: line.variant_id,
    quantity: line.quantity,
    originalUnitPrice: centsToDecimal(line.quoted_unit_price_cents ?? 0),
  }));

  return {
    lineItems,
    email: quote.customer_email,
    note: quote.notes ?? undefined,
    currency: shopCurrency,
    tags: [`quote-${quote.quote_number}`],
  };
}

export async function createDraftOrderFromQuote(
  graphql: AdminGraphqlClient,
  quote: QuoteWithLines,
  shopCurrency: string,
): Promise<
  | { ok: true; draftOrderId: string; draftOrderName: string }
  | { ok: false; error: string }
> {
  const input = buildDraftOrderInput(quote, shopCurrency);
  const res = await graphql(CREATE_DRAFT_ORDER, { variables: { input } });
  const json = (await res.json()) as GraphqlResult<DraftOrderCreateData>;

  if (json.errors?.length) return { ok: false, error: json.errors[0].message };
  const mutation = json.data?.draftOrderCreate;
  if (!mutation?.draftOrder) {
    const userErrors = mutation?.userErrors ?? [];
    return {
      ok: false,
      error: userErrors[0]?.message ?? "Failed to create the draft order.",
    };
  }

  return {
    ok: true,
    draftOrderId: mutation.draftOrder.id,
    draftOrderName: mutation.draftOrder.name,
  };
}

export async function sendDraftOrderInvoice(
  graphql: AdminGraphqlClient,
  draftOrderId: string,
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await graphql(SEND_DRAFT_ORDER_INVOICE, {
    variables: { draftOrderId, email },
  });
  const json = (await res.json()) as GraphqlResult<DraftOrderInvoiceSendData>;

  if (json.errors?.length) return { ok: false, error: json.errors[0].message };
  const mutation = json.data?.draftOrderInvoiceSend;
  if (!mutation?.draftOrder) {
    const userErrors = mutation?.userErrors ?? [];
    return {
      ok: false,
      error: userErrors[0]?.message ?? "Failed to send the invoice.",
    };
  }
  return { ok: true };
}
