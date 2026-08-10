-- Request a Quote base schema.
--
-- Every table lives in the shared "Creatix Projects" Supabase instance and is
-- prefixed `request_a_quote_` behind DENY-ALL RLS: RLS is enabled with NO
-- policies, so the anon key (which other consumers of the shared instance hold)
-- cannot touch them. Only the service-role client (app/lib/supabase.server.ts)
-- reaches these tables — tenant isolation is therefore enforced IN CODE via
-- `.eq("shop_domain", …)` on every query. Keep the prefix + RLS posture on
-- every new table.
--
-- Before launch, extract these tables into a dedicated Supabase project.

create extension if not exists moddatetime schema extensions;

-- ── Sessions ───────────────────────────────────────────────────────────────
-- Shopify OAuth sessions (app/lib/session-storage.server.ts). The session is
-- round-tripped through Session.toPropertyArray into a jsonb `payload`, so
-- @shopify/shopify-api schema changes don't require a migration here. The
-- natural key is Shopify's globally-unique session id.
create table if not exists request_a_quote_sessions (
  id          text primary key,
  shop_domain text        not null,
  payload     jsonb       not null,
  expires_at  timestamptz
);
create index if not exists request_a_quote_sessions_shop_domain_idx
  on request_a_quote_sessions (shop_domain);

alter table request_a_quote_sessions enable row level security;

-- ── Shops (tenant root) ──────────────────────────────────────────────────────
-- One row per installed shop. `shop_domain` is the tenant key every other
-- table scopes by. The row survives uninstall (kept for reinstalls); the
-- install/uninstall transition is tracked by installed_at/uninstalled_at.
--
-- Billing columns are reconciled from Shopify App Subscriptions
-- (app_subscriptions/update webhook + billing.server.ts) — Shopify is the
-- source of truth.
--
--   plan            'free' | 'pro' — 'free' = no active subscription
--   billing_active  whether a paid subscription is currently ACTIVE. Shopify
--                   marks a subscription ACTIVE from approval through the trial,
--                   so billing_active alone is the entitlement signal.
--   subscription_id Shopify AppSubscription GID of the active sub
--   shop_email      store contact email, cached for merchant notifications
--   notification_email  explicit override for where notifications are sent
--   settings        JSON settings document (see app/lib/settings.server.ts):
--                   { enabled, eligibility, form, show_price, ... }
create table if not exists request_a_quote_shops (
  shop_domain        text primary key,
  installed_at       timestamptz not null default now(),
  uninstalled_at     timestamptz,
  plan               text        not null default 'free',
  billing_active     boolean     not null default false,
  subscription_id    text,
  shop_email         text,
  notification_email text,
  settings           jsonb       not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger request_a_quote_shops_set_updated_at
  before update on request_a_quote_shops
  for each row execute procedure extensions.moddatetime(updated_at);

alter table request_a_quote_shops enable row level security;

-- ── Quotes ───────────────────────────────────────────────────────────────────
-- A storefront quote request. Money is stored as INTEGER minor units
-- (`*_cents`) — never floating point. `*_cents` on the quote are the
-- MERCHANT-set totals (subtotal of quoted prices, minus discount, plus
-- shipping); tax is NOT calculated here — Shopify owns tax at Draft Order time
-- and we record what it returns in tax_cents.
--
--   status        'new' | 'in_progress' | 'sent' | 'accepted' | 'declined' | 'archived'
--   quoted        true once every line has a quoted unit price and the merchant
--                 has saved pricing (drives the list "total" column)
--   draft_order_claim_at  concurrency guard: set when a draft order creation
--                 starts, cleared on failure. Only one creation may run.
--   client_request_id  storefront-generated idempotency key (unique per shop)
--   notification_*  outcome of the merchant notification attempt; a quote is
--                 never lost when a notification fails
create table if not exists request_a_quote_quotes (
  id                     uuid primary key default gen_random_uuid(),
  shop_domain            text        not null,
  quote_number           bigint      not null,
  status                 text        not null default 'new',
  customer_name          text        not null,
  customer_email         text        not null,
  customer_company       text,
  customer_phone         text,
  customer_id            text,
  notes                  text,
  currency               text        not null default 'USD',
  subtotal_cents         bigint      not null default 0,
  discount_cents         bigint      not null default 0,
  shipping_cents         bigint      not null default 0,
  tax_cents              bigint      not null default 0,
  total_cents            bigint      not null default 0,
  quoted                 boolean     not null default false,
  draft_order_id         text,
  draft_order_name       text,
  draft_order_created_at timestamptz,
  draft_order_claim_at   timestamptz,
  invoice_sent_at        timestamptz,
  accepted_at            timestamptz,
  declined_at            timestamptz,
  archived_at            timestamptz,
  internal_notes         text,
  client_request_id      text,
  notification_status    text,
  notification_error     text,
  notification_attempts  integer     not null default 0,
  submitted_at           timestamptz not null default now(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists request_a_quote_quotes_shop_created_idx
  on request_a_quote_quotes (shop_domain, created_at desc);
create index if not exists request_a_quote_quotes_shop_status_idx
  on request_a_quote_quotes (shop_domain, status);
create index if not exists request_a_quote_quotes_shop_email_idx
  on request_a_quote_quotes (shop_domain, customer_email);
create unique index if not exists request_a_quote_quotes_shop_number_uidx
  on request_a_quote_quotes (shop_domain, quote_number);
create unique index if not exists request_a_quote_quotes_client_request_uidx
  on request_a_quote_quotes (shop_domain, client_request_id)
  where client_request_id is not null;
create unique index if not exists request_a_quote_quotes_draft_order_uidx
  on request_a_quote_quotes (draft_order_id)
  where draft_order_id is not null;

alter table request_a_quote_quotes enable row level security;

-- ── Quote lines ──────────────────────────────────────────────────────────────
-- A snapshot of what the customer selected at submission time, so later product
-- edits never corrupt historical quotes. selected_options / custom_properties
-- are JSON arrays of {name, value} / {key, value}.
create table if not exists request_a_quote_lines (
  id                   uuid primary key default gen_random_uuid(),
  shop_domain          text not null,
  quote_id             uuid not null references request_a_quote_quotes(id) on delete cascade,
  position             integer   not null,
  product_id           text      not null,
  variant_id           text      not null,
  product_title        text      not null,
  variant_title        text      not null default '',
  sku                  text,
  quantity             integer   not null,
  original_price_cents bigint,
  quoted_unit_price_cents bigint,
  image_url            text,
  product_url          text,
  selected_options     jsonb     not null default '[]'::jsonb,
  custom_properties    jsonb     not null default '[]'::jsonb,
  created_at           timestamptz not null default now()
);

create index if not exists request_a_quote_lines_quote_idx
  on request_a_quote_lines (quote_id);
create index if not exists request_a_quote_lines_shop_quote_idx
  on request_a_quote_lines (shop_domain, quote_id);

alter table request_a_quote_lines enable row level security;

-- ── Per-shop quote numbering ────────────────────────────────────────────────
-- Allocate the next quote_number for a shop. Runs in a transaction so two
-- concurrent storefront submissions cannot hand out the same number; the
-- unique index (shop_domain, quote_number) is the backstop.
create or replace function request_a_quote_next_number(p_shop_domain text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  select coalesce(max(quote_number), 0) + 1
    into v_next
    from request_a_quote_quotes
   where shop_domain = p_shop_domain
     for update;
  return v_next;
end;
$$;

revoke all on function request_a_quote_next_number(text) from public;
