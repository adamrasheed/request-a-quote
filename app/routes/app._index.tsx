import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopRow } from "../lib/shops.server";
import { countActiveQuotes, listQuotes } from "../lib/quotes.server";
import { isEntitled, quotesRemaining } from "../lib/access";
import { formatCurrency } from "../lib/money";
import { PRO_PLAN } from "../lib/plans";
import type { QuoteStatus } from "../types/db";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [shopRow, activeCount, recent] = await Promise.all([
    getShopRow(shop),
    countActiveQuotes(shop),
    listQuotes(shop, 5),
  ]);
  if (!shopRow) throw new Error("Shop not found. Try reinstalling the app.");

  const entitled = isEntitled(shopRow, activeCount);
  const remaining = quotesRemaining(shopRow, activeCount);

  return {
    shop: shopRow,
    activeCount,
    recent: recent.map((q) => ({
      id: q.id,
      quote_number: q.quote_number,
      status: q.status,
      customer_name: q.customer_name,
      total_cents: q.total_cents,
      currency: q.currency,
      created_at: q.created_at,
    })),
    entitled,
    remaining,
    plan: shopRow.plan,
    planName: PRO_PLAN,
  };
};

export default function Index() {
  const { shop, activeCount, recent, entitled, remaining, plan, planName } =
    useLoaderData<typeof loader>();

  const statusTone: Record<
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

  return (
    <s-page heading="Request a Quote">
      {!entitled && (
        <s-banner tone="warning" heading="Free plan limit reached">
          <s-paragraph>
            You&apos;ve used your free quote requests. Upgrade to {planName} for
            unlimited quote requests.
          </s-paragraph>
          <s-button href="/app/billing" variant="primary">
            Upgrade now
          </s-button>
        </s-banner>
      )}

      <s-section heading="Overview">
        <s-grid>
          <s-box
            border="base"
            borderRadius="base"
            padding="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Active quote requests</s-text>
              <s-heading>{activeCount}</s-heading>
            </s-stack>
          </s-box>
          <s-box
            border="base"
            borderRadius="base"
            padding="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Quotes remaining</s-text>
              <s-heading>
                {plan === "pro" ? "Unlimited" : Math.max(0, remaining)}
              </s-heading>
            </s-stack>
          </s-box>
          <s-box
            border="base"
            borderRadius="base"
            padding="base"
            background="subdued"
          >
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Plan</s-text>
              <s-heading>{plan === "pro" ? "Pro" : "Free"}</s-heading>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      <s-section heading="Recent quote requests">
        {recent.length === 0 ? (
          <s-stack direction="block" gap="small">
            <s-paragraph>No quote requests yet.</s-paragraph>
            <s-paragraph>
              Once a customer submits a request from your storefront, it will
              appear here.
            </s-paragraph>
          </s-stack>
        ) : (
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header>Number</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Total</s-table-header>
              <s-table-header>Received</s-table-header>
            </s-table-header-row>
            {recent.map((quote) => (
              <s-table-row key={quote.id}>
                <s-table-cell>
                  <s-link href={`/app/quotes/${quote.id}`}>
                    #{quote.quote_number}
                  </s-link>
                </s-table-cell>
                <s-table-cell>{quote.customer_name}</s-table-cell>
                <s-table-cell>
                  <s-badge tone={statusTone[quote.status]}>
                    {quote.status.replace("_", " ")}
                  </s-badge>
                </s-table-cell>
                <s-table-cell>
                  {formatCurrency(quote.total_cents, {
                    currencyCode: quote.currency,
                  })}
                </s-table-cell>
                <s-table-cell>
                  {new Date(quote.created_at).toLocaleDateString()}
                </s-table-cell>
              </s-table-row>
            ))}
          </s-table>
        )}
      </s-section>

      {shop.settings.enabled && (
        <s-banner tone="info" heading="Storefront is live">
          <s-paragraph>
            Your storefront is accepting quote requests. To change which
            products show the quote button or to pause requests, visit{" "}
            <s-link href="/app/settings">Settings</s-link>.
          </s-paragraph>
        </s-banner>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
