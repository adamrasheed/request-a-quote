import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { collectCustomerData, redactCustomerData } from "../lib/gdpr.server";
import { supabase } from "../lib/supabase.server";

type GDPRPayload = {
  customer?: { email?: string; id?: number } | null;
  orders_to_redact?: Array<{ id: number }> | null;
};

// Mandatory compliance webhooks, all delivered to /webhooks/gdpr (see
// shopify.app.toml). This app stores customer PII on the quotes table
// (name/email/company/phone/notes), so:
//   customers/data_request -> we must hand the data back
//   customers/redact       -> we must erase the customer's PII
//   shop/redact            -> we must erase everything for the shop

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  const p = (payload ?? {}) as GDPRPayload;

  switch (topic) {
    case "customers/data_request": {
      const data = await collectCustomerData(p.customer?.email);
      // The GDPR template expects data to be returned by email to the customer.
      // A production app sends this via the notifications pipeline; here we log
      // the count so the handler is auditable, and return 200 to acknowledge.
      console.log(
        `[gdpr] data_request for ${p.customer?.email}: ${data.length} quote(s) found`,
      );
      return new Response(null, { status: 200 });
    }
    case "customers/redact": {
      const { error } = await redactCustomerData(p);
      if (error) {
        console.error("[gdpr] customers/redact failed:", error);
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 200 });
    }
    case "shop/redact": {
      const { error: linesError } = await supabase
        .from("request_a_quote_lines")
        .delete()
        .eq("shop_domain", shop);
      if (linesError)
        console.error("[gdpr] shop/redact lines failed:", linesError.message);

      const { error: quotesError } = await supabase
        .from("request_a_quote_quotes")
        .delete()
        .eq("shop_domain", shop);
      if (quotesError)
        console.error("[gdpr] shop/redact quotes failed:", quotesError.message);

      const { error: sessionsError } = await supabase
        .from("request_a_quote_sessions")
        .delete()
        .eq("shop_domain", shop);
      if (sessionsError)
        console.error(
          "[gdpr] shop/redact sessions failed:",
          sessionsError.message,
        );

      const { error: shopError } = await supabase
        .from("request_a_quote_shops")
        .delete()
        .eq("shop_domain", shop);
      if (shopError)
        console.error("[gdpr] shop/redact shop failed:", shopError.message);

      if (linesError || quotesError || sessionsError || shopError) {
        return new Response(null, { status: 500 });
      }
      return new Response(null, { status: 200 });
    }
    default:
      return new Response(null, { status: 200 });
  }
};
