import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopRow } from "../lib/shops.server";
import {
  countActiveQuotes,
  createQuote,
  recordNotificationOutcome,
} from "../lib/quotes.server";
import { isEntitled } from "../lib/access";
import { isProductEligible } from "../lib/eligibility";
import { GET_VARIANT } from "../lib/shopify-operations.server";
import type { GraphqlResult } from "../types/graphql";
import { decimalToCents } from "../lib/money";
import { notifyMerchantOfNewQuote } from "../lib/notifications.server";
import { track } from "../lib/analytics.server";

type VariantData = {
  productVariant: {
    id: string;
    price: string;
    sku: string | null;
    title: string;
    product: {
      id: string;
      title: string;
      handle: string;
      featuredImage: { url: string } | null;
    };
  } | null;
};

function isEmail(value: string | null): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

// App proxy: the storefront block POSTs quote requests here. HMAC-verified, so
// the shop param is trusted; the variant id is NOT — it is re-verified against
// the Admin API before anything is stored.
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  if (!shop)
    return Response.json(
      { ok: false, error: "Missing shop." },
      { status: 400 },
    );

  const formData = await request.formData();
  const variantId = String(formData.get("variant_id") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
  const customerName = String(formData.get("customer_name") ?? "").trim();
  const customerEmail = String(formData.get("customer_email") ?? "").trim();
  const customerCompany =
    String(formData.get("customer_company") ?? "").trim() || null;
  const customerPhone =
    String(formData.get("customer_phone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const clientRequestId =
    String(formData.get("client_request_id") ?? "").trim() || null;

  if (!variantId)
    return Response.json(
      { ok: false, error: "Missing variant." },
      { status: 400 },
    );
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 9999) {
    return Response.json(
      { ok: false, error: "Invalid quantity." },
      { status: 400 },
    );
  }
  if (!customerName)
    return Response.json(
      { ok: false, error: "Name is required." },
      { status: 400 },
    );
  if (!isEmail(customerEmail)) {
    return Response.json(
      { ok: false, error: "A valid email is required." },
      { status: 400 },
    );
  }

  const shopRow = await getShopRow(shop);
  if (!shopRow)
    return Response.json(
      { ok: false, error: "Store not found." },
      { status: 404 },
    );

  const settings = shopRow.settings;
  if (!settings.enabled) {
    return Response.json(
      { ok: false, error: "Quote requests are currently disabled." },
      { status: 403 },
    );
  }
  if (!settings.form.customer_phone_optional && !customerPhone) {
    return Response.json(
      { ok: false, error: "Phone is required." },
      { status: 400 },
    );
  }
  if (!settings.form.company_optional && !customerCompany) {
    return Response.json(
      { ok: false, error: "Company is required." },
      { status: 400 },
    );
  }

  // Re-verify the variant against the live catalog (the proxy shop param is
  // trusted, the variant id is client input).
  const { admin } = await authenticate.public.appProxy(request);
  if (!admin) {
    return Response.json(
      { ok: false, error: "Store session not found." },
      { status: 401 },
    );
  }
  const res = await admin.graphql(GET_VARIANT, {
    variables: { id: variantId },
  });
  const json = (await res.json()) as GraphqlResult<VariantData>;
  const variant = json.data?.productVariant;

  if (json.errors?.length || !variant) {
    return Response.json(
      { ok: false, error: "That item is no longer available." },
      { status: 400 },
    );
  }
  if (!isProductEligible({ id: variant.product.id }, settings)) {
    return Response.json(
      { ok: false, error: "Quote requests are not available for this item." },
      { status: 403 },
    );
  }

  // Free tier: cap total non-archived quotes before saving.
  const activeCount = await countActiveQuotes(shop);
  if (!isEntitled(shopRow, activeCount)) {
    return Response.json(
      {
        ok: false,
        error: "This store has reached its free quote request limit.",
      },
      { status: 403 },
    );
  }

  const result = await createQuote({
    shop_domain: shop,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_company: customerCompany,
    customer_phone: customerPhone,
    customer_id: String(formData.get("customer_id") ?? "").trim() || null,
    notes,
    currency: "USD",
    client_request_id: clientRequestId,
    lines: [
      {
        product_id: variant.product.id,
        variant_id: variant.id,
        product_title: variant.product.title,
        variant_title: variant.title,
        sku: variant.sku,
        quantity,
        original_price_cents: decimalToCents(variant.price),
        image_url: variant.product.featuredImage?.url ?? null,
        product_url: `https://${shop}/products/${variant.product.handle}?variant=${variant.id}`,
      },
    ],
  });

  if (!result.ok) {
    return Response.json({ ok: false, error: result.error }, { status: 500 });
  }

  track(shop, "quote_requested", {
    quote_id: result.quote.id,
    quote_number: result.quote.quote_number,
  });

  const outcome = await notifyMerchantOfNewQuote(
    result.quote,
    `${process.env.SHOPIFY_APP_URL}/app/quotes/${result.quote.id}`,
  );
  await recordNotificationOutcome(shop, result.quote.id, outcome);

  return Response.json({
    ok: true,
    quote_number: result.quote.quote_number,
    message: "Thanks! Your quote request has been submitted.",
  });
};
