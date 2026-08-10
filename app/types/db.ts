export type QuoteStatus =
  "new" | "in_progress" | "sent" | "accepted" | "declined" | "archived";

export interface ShopRow {
  shop_domain: string;
  installed_at: string;
  uninstalled_at: string | null;
  plan: "free" | "pro";
  billing_active: boolean;
  subscription_id: string | null;
  shop_email: string | null;
  notification_email: string | null;
  settings: QuoteSettings;
  created_at: string;
  updated_at: string;
}

export interface QuoteRow {
  id: string;
  shop_domain: string;
  quote_number: number;
  status: QuoteStatus;
  customer_name: string;
  customer_email: string;
  customer_company: string | null;
  customer_phone: string | null;
  customer_id: string | null;
  notes: string | null;
  currency: string;
  subtotal_cents: number;
  discount_cents: number;
  shipping_cents: number;
  tax_cents: number;
  total_cents: number;
  quoted: boolean;
  draft_order_id: string | null;
  draft_order_name: string | null;
  draft_order_created_at: string | null;
  draft_order_claim_at: string | null;
  invoice_sent_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  archived_at: string | null;
  internal_notes: string | null;
  client_request_id: string | null;
  notification_status: string | null;
  notification_error: string | null;
  notification_attempts: number;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

export interface QuoteLineRow {
  id: string;
  shop_domain: string;
  quote_id: string;
  position: number;
  product_id: string;
  variant_id: string;
  product_title: string;
  variant_title: string;
  sku: string | null;
  quantity: number;
  original_price_cents: number | null;
  quoted_unit_price_cents: number | null;
  image_url: string | null;
  product_url: string | null;
  selected_options: { name: string; value: string }[];
  custom_properties: { key: string; value: string }[];
  created_at: string;
}

export interface QuoteWithLines extends QuoteRow {
  lines: QuoteLineRow[];
}

/** JSON settings document stored on the shop row (app/lib/settings.server.ts). */
export interface QuoteSettings {
  enabled: boolean;
  eligibility: {
    /** Whitelist mode: quote button appears only on products whose variants all pass the rule. */
    mode: "all" | "whitelist";
    whitelistIds: string[];
  };
  form: {
    customer_phone_optional: boolean;
    company_optional: boolean;
  };
  /** Show the merchant-set quoted price on the storefront once the quote is sent. */
  show_price: boolean;
  /** Button label override. */
  button_label: string;
}
