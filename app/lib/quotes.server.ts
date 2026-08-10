import { supabase } from "./supabase.server";
import type {
  QuoteLineRow,
  QuoteRow,
  QuoteWithLines,
  QuoteStatus,
} from "../types/db";
import { fullQuoteTotals, isQuoteFullyQuoted } from "./quotes";

// Server-side quote persistence + numbering. All queries scope by shop_domain.

type CreateQuoteInput = {
  shop_domain: string;
  customer_name: string;
  customer_email: string;
  customer_company?: string | null;
  customer_phone?: string | null;
  customer_id?: string | null;
  notes?: string | null;
  currency: string;
  client_request_id?: string | null;
  lines: Array<{
    product_id: string;
    variant_id: string;
    product_title: string;
    variant_title?: string;
    sku?: string | null;
    quantity: number;
    original_price_cents?: number | null;
    image_url?: string | null;
    product_url?: string | null;
    selected_options?: { name: string; value: string }[];
    custom_properties?: { key: string; value: string }[];
  }>;
};

type CreateQuoteResult =
  | { ok: true; quote: QuoteWithLines }
  | { ok: false; error: string; code?: string };

// Allocate the next per-shop quote number inside a transaction so two
// concurrent submissions can't collide. Returns 1-based sequence.
async function nextQuoteNumber(shop: string): Promise<number> {
  const { data, error } = await supabase.rpc("request_a_quote_next_number", {
    p_shop_domain: shop,
  });
  if (!error && typeof data === "number" && Number.isFinite(data)) return data;

  // Fallback: max + 1. The unique index (shop_domain, quote_number) still
  // guards against races; a conflict would surface as an insert error.
  const { data: rows } = await supabase
    .from("request_a_quote_quotes")
    .select("quote_number")
    .eq("shop_domain", shop)
    .order("quote_number", { ascending: false })
    .limit(1);
  return (rows?.[0]?.quote_number ?? 0) + 1;
}

export async function createQuote(
  input: CreateQuoteInput,
): Promise<CreateQuoteResult> {
  const { shop_domain, lines, ...quote } = input;
  if (!lines.length) return { ok: false, error: "No items on the request." };

  const quoteNumber = await nextQuoteNumber(shop_domain);

  const { data: inserted, error } = await supabase
    .from("request_a_quote_quotes")
    .insert({
      ...quote,
      shop_domain,
      quote_number: quoteNumber,
      currency: quote.currency || "USD",
    })
    .select("*")
    .single();

  if (error) {
    console.error("createQuote error:", error.message);
    return { ok: false, error: "Failed to save the quote request." };
  }

  const quoteRow = inserted as QuoteRow;

  const lineRows: Array<Omit<QuoteLineRow, "id" | "created_at">> = lines.map(
    (line, index) => ({
      shop_domain,
      quote_id: quoteRow.id,
      position: index,
      product_id: line.product_id,
      variant_id: line.variant_id,
      product_title: line.product_title,
      variant_title: line.variant_title ?? "",
      sku: line.sku ?? null,
      quantity: line.quantity,
      original_price_cents: line.original_price_cents ?? null,
      quoted_unit_price_cents: null,
      image_url: line.image_url ?? null,
      product_url: line.product_url ?? null,
      selected_options: line.selected_options ?? [],
      custom_properties: line.custom_properties ?? [],
    }),
  );

  const { data: insertedLines, error: linesError } = await supabase
    .from("request_a_quote_lines")
    .insert(lineRows)
    .select("*");

  if (linesError) {
    console.error("createQuote lines error:", linesError.message);
    return { ok: false, error: "Failed to save the quote request items." };
  }

  return {
    ok: true,
    quote: { ...quoteRow, lines: (insertedLines as QuoteLineRow[]) ?? [] },
  };
}

export async function getQuote(
  shop: string,
  id: string,
): Promise<QuoteWithLines | null> {
  const { data: quote, error } = await supabase
    .from("request_a_quote_quotes")
    .select("*")
    .eq("shop_domain", shop)
    .eq("id", id)
    .single();

  if (error) return null;
  const quoteRow = quote as QuoteRow;

  const { data: lines } = await supabase
    .from("request_a_quote_lines")
    .select("*")
    .eq("shop_domain", shop)
    .eq("quote_id", quoteRow.id)
    .order("position", { ascending: true });

  return { ...quoteRow, lines: (lines as QuoteLineRow[]) ?? [] };
}

export async function listQuotes(
  shop: string,
  limit = 50,
): Promise<QuoteWithLines[]> {
  const { data: quotes, error } = await supabase
    .from("request_a_quote_quotes")
    .select("*")
    .eq("shop_domain", shop)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !quotes) return [];
  const rows = quotes as QuoteRow[];
  if (rows.length === 0) return [];

  const ids = rows.map((q) => q.id);
  const { data: lines } = await supabase
    .from("request_a_quote_lines")
    .select("*")
    .eq("shop_domain", shop)
    .in("quote_id", ids);

  const byQuote = new Map<string, QuoteLineRow[]>();
  for (const line of (lines as QuoteLineRow[]) ?? []) {
    const bucket = byQuote.get(line.quote_id) ?? [];
    bucket.push(line);
    byQuote.set(line.quote_id, bucket);
  }

  return rows.map((q) => ({
    ...q,
    lines: (byQuote.get(q.id) ?? []).sort((a, b) => a.position - b.position),
  }));
}

export async function countActiveQuotes(shop: string): Promise<number> {
  const { count, error } = await supabase
    .from("request_a_quote_quotes")
    .select("*", { count: "exact", head: true })
    .eq("shop_domain", shop)
    .in("status", ["new", "in_progress", "sent", "accepted"]);

  if (error) {
    console.error("countActiveQuotes error:", error.message);
    return 0;
  }
  return count ?? 0;
}

export type UpdatePricingInput = {
  lines: Array<{ id: string; quoted_unit_price_cents: number | null }>;
  discount_cents?: number;
  shipping_cents?: number;
};

export async function savePricing(
  shop: string,
  quoteId: string,
  input: UpdatePricingInput,
): Promise<{ ok: boolean; error?: string }> {
  // Validate ownership of every line before mutating anything.
  const quote = await getQuote(shop, quoteId);
  if (!quote) return { ok: false, error: "Quote not found." };

  const lineById = new Map(quote.lines.map((l) => [l.id, l]));
  const updates = input.lines.map((l) => {
    const existing = lineById.get(l.id);
    if (!existing) return { invalid: true as const, id: l.id };
    return { invalid: false as const, existing };
  });
  if (updates.some((u) => u.invalid))
    return { ok: false, error: "One or more line items are invalid." };

  const mergedLines = quote.lines.map((line) => {
    const match = input.lines.find((l) => l.id === line.id);
    return {
      ...line,
      quoted_unit_price_cents: match
        ? match.quoted_unit_price_cents
        : line.quoted_unit_price_cents,
    };
  });

  const allQuoted = isQuoteFullyQuoted(mergedLines);
  const totals = fullQuoteTotals(mergedLines, {
    discount_cents: input.discount_cents ?? quote.discount_cents ?? 0,
    shipping_cents: input.shipping_cents ?? quote.shipping_cents ?? 0,
    tax_cents: quote.tax_cents ?? 0,
  });

  const { data: updatedQuote, error: quoteError } = await supabase
    .from("request_a_quote_quotes")
    .update({
      quoted: allQuoted,
      subtotal_cents: totals.subtotal_cents,
      discount_cents: totals.discount_cents,
      shipping_cents: totals.shipping_cents,
      total_cents: totals.total_cents,
    })
    .eq("shop_domain", shop)
    .eq("id", quoteId)
    .select("id");

  if (quoteError || !updatedQuote?.length) {
    return {
      ok: false,
      error: quoteError?.message ?? "Failed to save pricing.",
    };
  }

  for (const line of input.lines) {
    const { error: lineError } = await supabase
      .from("request_a_quote_lines")
      .update({ quoted_unit_price_cents: line.quoted_unit_price_cents })
      .eq("shop_domain", shop)
      .eq("quote_id", quoteId)
      .eq("id", line.id);
    if (lineError) return { ok: false, error: "Failed to save line pricing." };
  }

  return { ok: true };
}

export async function updateQuoteStatus(
  shop: string,
  quoteId: string,
  status: QuoteStatus,
): Promise<{ ok: boolean; error?: string }> {
  const timestampField: Partial<Record<QuoteStatus, string>> = {
    sent: "invoice_sent_at",
    accepted: "accepted_at",
    declined: "declined_at",
    archived: "archived_at",
  };
  const timestamp =
    status === "sent" ? new Date().toISOString() : timestampField[status];

  const { data: updated, error } = await supabase
    .from("request_a_quote_quotes")
    .update({
      status,
      ...(timestamp ? { [timestamp]: new Date().toISOString() } : {}),
    })
    .eq("shop_domain", shop)
    .eq("id", quoteId)
    .select("id");

  if (error || !updated?.length)
    return { ok: false, error: error?.message ?? "Failed to update status." };
  return { ok: true };
}

// Claim the right to create a draft order for this quote. Only one creation may
// run at a time: a double-click on "Send quote" would otherwise create two
// draft orders and send two invoices. The claim is released when the send
// completes or fails.
export async function claimDraftOrderCreation(
  shop: string,
  quoteId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabase
    .from("request_a_quote_quotes")
    .update({ draft_order_claim_at: new Date().toISOString() })
    .eq("shop_domain", shop)
    .eq("id", quoteId)
    .is("draft_order_claim_at", null)
    .in("status", ["new", "in_progress"])
    .select("id");

  if (error || !data?.length)
    return {
      ok: false,
      error: error?.message ?? "This quote is already being sent.",
    };
  return { ok: true };
}

// Release a claim so the merchant can retry after a failed send.
export async function releaseDraftOrderClaim(
  shop: string,
  quoteId: string,
): Promise<void> {
  await supabase
    .from("request_a_quote_quotes")
    .update({ draft_order_claim_at: null })
    .eq("shop_domain", shop)
    .eq("id", quoteId);
}

// Record the created draft order and mark the quote sent in one atomic update,
// gated on the claim still being held. Persisting the draft order fields keeps
// `draft_order_id is not null <=> invoice sent` true, matching the unique index.
export async function recordDraftOrderSent(
  shop: string,
  quoteId: string,
  draftOrder: { id: string; name: string },
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("request_a_quote_quotes")
    .update({
      status: "sent",
      invoice_sent_at: new Date().toISOString(),
      draft_order_id: draftOrder.id,
      draft_order_name: draftOrder.name,
      draft_order_created_at: new Date().toISOString(),
      draft_order_claim_at: null,
    })
    .eq("shop_domain", shop)
    .eq("id", quoteId)
    .not("draft_order_claim_at", "is", null);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Record the outcome of the merchant notification attempt so a quote is never
// silently lost when email fails.
export async function recordNotificationOutcome(
  shop: string,
  quoteId: string,
  outcome: { status: string; error?: string | null },
): Promise<void> {
  await supabase
    .from("request_a_quote_quotes")
    .update({
      notification_status: outcome.status,
      notification_error: outcome.error ?? null,
      notification_attempts: 1,
    })
    .eq("shop_domain", shop)
    .eq("id", quoteId);
}
