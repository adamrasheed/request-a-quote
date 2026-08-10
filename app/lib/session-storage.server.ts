import { Session } from "@shopify/shopify-api";
import { supabase } from "./supabase.server";

// Shopify OAuth sessions, persisted to `request_a_quote_sessions`. The session
// is round-tripped through Session.toPropertyArray into a jsonb `payload`, so
// @shopify/shopify-api schema changes don't require a migration here. The
// natural key is Shopify's globally-unique session id.

export const supabaseSessionStorage = {
  async storeSession(session: Session): Promise<boolean> {
    const { error } = await supabase.from("request_a_quote_sessions").upsert({
      id: session.id,
      shop_domain: session.shop,
      payload: session.toPropertyArray(),
      expires_at: session.expires?.toISOString() ?? null,
    });
    if (error) console.error("[session-storage] storeSession error:", error);
    return !error;
  },

  async loadSession(id: string): Promise<Session | undefined> {
    const { data, error } = await supabase
      .from("request_a_quote_sessions")
      .select("payload")
      .eq("id", id)
      .single();

    if (error) console.error("[session-storage] loadSession error:", error);
    if (error || !data) return undefined;

    try {
      return Session.fromPropertyArray(data.payload as never[]);
    } catch (err) {
      console.error("[session-storage] failed to parse session payload:", err);
      return undefined;
    }
  },

  async deleteSession(id: string): Promise<boolean> {
    const { error } = await supabase
      .from("request_a_quote_sessions")
      .delete()
      .eq("id", id);
    return !error;
  },

  async deleteSessions(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return true;
    const { error } = await supabase
      .from("request_a_quote_sessions")
      .delete()
      .in("id", ids);
    return !error;
  },

  async findSessionsByShop(shop: string): Promise<Session[]> {
    const { data, error } = await supabase
      .from("request_a_quote_sessions")
      .select("id, payload")
      .eq("shop_domain", shop);

    if (error || !data) return [];
    return data.flatMap((row) => {
      try {
        return [Session.fromPropertyArray(row.payload as never[])];
      } catch (err) {
        console.error(
          "[session-storage] failed to parse session payload:",
          err,
        );
        return [];
      }
    });
  },
};
