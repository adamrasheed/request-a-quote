import { supabase } from "./supabase.server";

// GDPR / privacy compliance handlers. This app stores customer data on the
// quotes table (customer_name, customer_email, customer_company,
// customer_phone, notes), so customers/data_request must surface it and
// customers/redact must remove it.
//
// Shopify delivers these by customer id and/or email. We key on email: the
// quote's customer_email is the one stable identifier a request carries.

type RedactPayload = {
  customer?: { id?: number; email?: string } | null;
  orders_to_redact?: Array<{ id: number }> | null;
  shop_domain?: string;
};

export async function collectCustomerData(
  customerEmail?: string,
): Promise<unknown[]> {
  if (!customerEmail) return [];
  const { data } = await supabase
    .from("request_a_quote_quotes")
    .select(
      "quote_number, customer_name, customer_email, customer_company, customer_phone, notes, submitted_at, lines:request_a_quote_lines(product_title, variant_title, quantity, created_at)",
    )
    .eq("customer_email", customerEmail);
  return data ?? [];
}

export async function redactCustomerData(
  payload: RedactPayload,
): Promise<{ error?: string }> {
  const customerEmail = payload.customer?.email;
  if (!customerEmail) return {};

  // Anonymize instead of hard-deleting: quote history (totals, status, draft
  // order) stays meaningful for the merchant, but the PII is removed.
  const { error } = await supabase
    .from("request_a_quote_quotes")
    .update({
      customer_name: "Redacted",
      customer_email: "redacted@example.com",
      customer_company: null,
      customer_phone: null,
      notes: null,
    })
    .eq("customer_email", customerEmail);

  return { error: error?.message };
}
