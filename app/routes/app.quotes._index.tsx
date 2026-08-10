import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { listQuotes } from "../lib/quotes.server";
import { formatCurrency } from "../lib/money";
import type { QuoteStatus } from "../types/db";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const quotes = await listQuotes(session.shop, 100);
  return {
    quotes: quotes.map((q) => ({
      id: q.id,
      quote_number: q.quote_number,
      status: q.status,
      customer_name: q.customer_name,
      customer_email: q.customer_email,
      quoted: q.quoted,
      total_cents: q.total_cents,
      currency: q.currency,
      created_at: q.created_at,
    })),
  };
};

export default function QuotesPage() {
  const { quotes } = useLoaderData<typeof loader>();

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
    <s-page heading="Quote requests">
      {quotes.length === 0 ? (
        <s-banner tone="info" heading="No quote requests yet">
          <s-paragraph>
            When a customer submits a request from your storefront, it will show
            up here. You can then price the items and send the customer a quote.
          </s-paragraph>
        </s-banner>
      ) : (
        <s-table variant="auto">
          <s-table-header-row>
            <s-table-header>Number</s-table-header>
            <s-table-header>Customer</s-table-header>
            <s-table-header>Status</s-table-header>
            <s-table-header>Total</s-table-header>
            <s-table-header>Received</s-table-header>
          </s-table-header-row>
          {quotes.map((quote) => (
            <s-table-row key={quote.id}>
              <s-table-cell>
                <s-link href={`/app/quotes/${quote.id}`}>
                  #{quote.quote_number}
                </s-link>
              </s-table-cell>
              <s-table-cell>
                {quote.customer_name}
                <s-text color="subdued"> · {quote.customer_email}</s-text>
              </s-table-cell>
              <s-table-cell>
                <s-badge tone={statusTone[quote.status]}>
                  {quote.status.replace("_", " ")}
                </s-badge>
              </s-table-cell>
              <s-table-cell>
                {quote.quoted
                  ? formatCurrency(quote.total_cents, {
                      currencyCode: quote.currency,
                    })
                  : "Not priced"}
              </s-table-cell>
              <s-table-cell>
                {new Date(quote.created_at).toLocaleDateString()}
              </s-table-cell>
            </s-table-row>
          ))}
        </s-table>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
