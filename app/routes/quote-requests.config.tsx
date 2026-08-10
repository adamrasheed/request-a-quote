import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getShopRow } from "../lib/shops.server";
import { isProductEligible } from "../lib/eligibility";

// App proxy: the storefront block fetches this to decide whether to show the
// quote button and how to render the form. The proxy request is HMAC-verified
// by Shopify, so `shop` is trusted.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("product");

  if (!shop || !productId) return new Response("Bad request", { status: 400 });

  const shopRow = await getShopRow(shop);
  if (!shopRow) return new Response("Not found", { status: 404 });

  const settings = shopRow.settings;
  const eligible = isProductEligible({ id: productId }, settings);

  return Response.json({
    enabled: settings.enabled,
    eligible: eligible && settings.enabled,
    button_label: settings.button_label,
    show_price: settings.show_price,
    form: settings.form,
  });
};
