import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.webhook(request);

  // Scope changes only require the merchant to re-approve the app — there is
  // no server state to update here. The current scope is re-read from Shopify
  // on every authenticated request, and the session is refreshed on reinstall.
  return new Response(null, { status: 200 });
};
