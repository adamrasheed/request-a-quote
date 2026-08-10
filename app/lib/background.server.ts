// Run a fire-and-forget task on Vercel without delaying the response. This
// reads the same global @vercel/functions' waitUntil() wraps; used directly to
// avoid an extra dependency. Off-Vercel it's a no-op (a long-lived dev server
// keeps working on its own).
type VercelRequestContext = { waitUntil?: (promise: Promise<unknown>) => void };

export function schedule(promise: Promise<unknown>): void {
  const ctx = (
    globalThis as {
      [key: symbol]:
        { get?: () => VercelRequestContext | undefined } | undefined;
    }
  )[Symbol.for("@vercel/request-context")];
  ctx?.get?.()?.waitUntil?.(promise);
}
