import { Resend } from "resend";
import type { QuoteWithLines } from "../types/db";

// Merchant + customer email notifications, delivered via Resend. A missing
// RESEND_API_KEY means notifications are recorded-but-unsent; a quote is never
// lost when email is unavailable (callers persist the outcome instead).

function resend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

function fromAddress(): string | null {
  return process.env.RESEND_FROM || null;
}

export type NotificationOutcome = {
  status: "sent" | "skipped" | "failed";
  error?: string;
};

// Notify the merchant that a customer submitted a quote request. Best-effort:
// failures are resolved (never thrown) so the submission still succeeds, and
// the outcome is returned so callers can persist it on the quote.
export async function notifyMerchantOfNewQuote(
  quote: QuoteWithLines,
  adminUrl: string,
): Promise<NotificationOutcome> {
  const client = resend();
  const from = fromAddress();
  if (!client || !from) {
    console.warn(
      "[notifications] Resend not configured; skipped merchant email for quote",
      quote.quote_number,
    );
    return { status: "skipped", error: "Resend not configured" };
  }

  const lineSummary = quote.lines
    .map(
      (l) =>
        `${l.quantity} × ${l.product_title}${l.variant_title ? ` (${l.variant_title})` : ""}`,
    )
    .join("\n");

  try {
    const res = await client.emails.send({
      from,
      to: [process.env.RESEND_MERCHANT_TO || from],
      subject: `New quote request #${quote.quote_number} from ${quote.customer_name}`,
      text: `You received a new quote request.

Customer: ${quote.customer_name}
Email: ${quote.customer_email}
${quote.customer_company ? `Company: ${quote.customer_company}\n` : ""}
${quote.customer_phone ? `Phone: ${quote.customer_phone}\n` : ""}

Items:
${lineSummary}

${quote.notes ? `Notes:\n${quote.notes}\n` : ""}

Open it in the admin:
${adminUrl}`,
    });

    if (res.error) {
      console.error(
        "[notifications] merchant email failed:",
        res.error.message,
      );
      return { status: "failed", error: res.error.message };
    }
    return { status: "sent" };
  } catch (err) {
    console.error("[notifications] merchant email threw:", err);
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "Unknown email error",
    };
  }
}
