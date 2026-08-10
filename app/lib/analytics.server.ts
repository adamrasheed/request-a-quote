import { PostHog } from "posthog-node";

let _client: PostHog | null = null;

function getClient(): PostHog | null {
  if (!process.env.POSTHOG_API_KEY) return null;
  if (!_client) {
    _client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST || "https://app.posthog.com",
      // Flush immediately — critical for serverless (Vercel functions exit after response)
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return _client;
}

export function track(
  shop: string,
  event: string,
  properties?: Record<string, unknown>,
): void {
  const client = getClient();
  if (!client) return;
  client.capture({
    distinctId: shop,
    event,
    properties: { ...properties, shop },
  });
  client
    .flush()
    .catch((err: unknown) => console.error("PostHog flush failed:", err));
}
