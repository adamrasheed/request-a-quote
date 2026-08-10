import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

// Service role client — server only, never import client-side.
// Tables live in the public schema under the `request_a_quote_` prefix,
// behind DENY-ALL RLS (see supabase/migrations). Tenant isolation is enforced
// in code via `.eq("shop_domain", …)` on every query.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);
