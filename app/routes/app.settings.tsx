import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { boundary } from "@shopify/shopify-app-react-router/server";

import { authenticate } from "../shopify.server";
import { getShopRow } from "../lib/shops.server";
import { supabase } from "../lib/supabase.server";
import { normalizeSettings } from "../lib/settings";
import {
  SEARCH_PRODUCTS,
  GET_PRODUCTS_BY_ID,
} from "../lib/shopify-operations.server";
import type { GraphqlResult, ProductsSearchData } from "../types/graphql";
import { track } from "../lib/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopRow = await getShopRow(session.shop);
  if (!shopRow) throw new Error("Shop not found. Try reinstalling the app.");

  // Resolve current whitelist ids to product titles for the UI.
  const settings = normalizeSettings(shopRow.settings);
  let whitelistProducts: { id: string; title: string }[] = [];
  if (
    settings.eligibility.mode === "whitelist" &&
    settings.eligibility.whitelistIds.length > 0
  ) {
    const res = await admin.graphql(GET_PRODUCTS_BY_ID, {
      variables: { ids: settings.eligibility.whitelistIds },
    });
    const json = (await res.json()) as GraphqlResult<{
      nodes: Array<{ __typename: string; id: string; title: string } | null>;
    }>;
    whitelistProducts = (json.data?.nodes ?? [])
      .filter(
        (n): n is { __typename: string; id: string; title: string } =>
          n?.__typename === "Product",
      )
      .map((n) => ({ id: n.id, title: n.title }));
  }

  return {
    settings,
    whitelistProducts,
    notification_email: shopRow.notification_email,
  };
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "search_products") {
    const { admin } = await authenticate.admin(request);
    const query = String(formData.get("query") ?? "").trim();
    if (!query) return { results: [] };
    const res = await admin.graphql(SEARCH_PRODUCTS, {
      variables: { query: `title:*${query}*`, first: 10 },
    });
    const json = (await res.json()) as GraphqlResult<ProductsSearchData>;
    const nodes = json.data?.products?.nodes ?? [];
    return {
      results: nodes
        .filter((n) => n.status === "ACTIVE")
        .map((n) => ({ id: n.id, title: n.title, handle: n.handle })),
    };
  }

  if (intent === "save") {
    const settings = normalizeSettings(
      JSON.parse((formData.get("settings") as string) || "{}"),
    );

    const { error } = await supabase
      .from("request_a_quote_shops")
      .update({ settings })
      .eq("shop_domain", shop)
      .select("id");
    if (error) return { error: "Failed to save settings." };

    track(shop, "settings_saved", { mode: settings.eligibility.mode });
    return { success: "Settings saved" };
  }

  return { error: "Unknown intent." };
};

export default function SettingsPage() {
  const { settings: initialSettings, whitelistProducts: initialWhitelist } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [settings, setSettings] = useState(initialSettings);
  const [whitelist, setWhitelist] =
    useState<{ id: string; title: string }[]>(initialWhitelist);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!fetcher.data) return;
    if ("success" in fetcher.data) {
      shopify.toast.show(fetcher.data.success as string);
    } else if ("error" in fetcher.data) {
      shopify.toast.show(fetcher.data.error as string, { isError: true });
    } else if ("results" in fetcher.data) {
      setResults(fetcher.data.results);
    }
  }, [fetcher.data, shopify]);

  function searchProducts() {
    const data = new FormData();
    data.set("intent", "search_products");
    data.set("query", search);
    fetcher.submit(data, { method: "POST" });
  }

  function toggleProduct(id: string, title: string) {
    setWhitelist((prev) =>
      prev.some((p) => p.id === id)
        ? prev.filter((p) => p.id !== id)
        : [...prev, { id, title }],
    );
  }

  function save() {
    const data = new FormData();
    data.set("intent", "save");
    const next = {
      ...settings,
      eligibility: {
        ...settings.eligibility,
        whitelistIds: whitelist.map((p) => p.id),
      },
    };
    data.set("settings", JSON.stringify(next));
    fetcher.submit(data, { method: "POST" });
  }

  return (
    <s-page heading="Settings">
      <s-section heading="Storefront">
        <s-checkbox
          label="Enable quote requests on my storefront"
          checked={settings.enabled}
          onChange={(e: Event) =>
            setSettings((prev) => ({
              ...prev,
              enabled: (e.target as HTMLInputElement).checked,
            }))
          }
        />
        <s-stack direction="block" gap="small">
          <label htmlFor="button-label">
            <s-text color="subdued">Button label</s-text>
          </label>
          <input
            id="button-label"
            type="text"
            value={settings.button_label}
            onChange={(e) =>
              setSettings((prev) => ({ ...prev, button_label: e.target.value }))
            }
            maxLength={60}
            style={{
              padding: "8px 12px",
              border: "1px solid #c9cccf",
              borderRadius: "4px",
              fontSize: "14px",
              width: "280px",
            }}
          />
        </s-stack>
        <s-checkbox
          label="Show the quoted price on the storefront once sent"
          checked={settings.show_price}
          onChange={(e: Event) =>
            setSettings((prev) => ({
              ...prev,
              show_price: (e.target as HTMLInputElement).checked,
            }))
          }
        />
      </s-section>

      <s-section heading="Eligibility">
        <s-stack direction="block" gap="small">
          <s-choice-list
            name="eligibility-mode"
            values={[settings.eligibility.mode]}
            onChange={(e) => {
              const mode = e.currentTarget.values?.includes("whitelist")
                ? "whitelist"
                : "all";
              setSettings((prev) => ({
                ...prev,
                eligibility: { ...prev.eligibility, mode },
              }));
            }}
          >
            <s-choice value="all">All products</s-choice>
            <s-choice value="whitelist">Selected products</s-choice>
          </s-choice-list>

          {settings.eligibility.mode === "whitelist" && (
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Products with a quote button</s-text>
              {whitelist.length > 0 && (
                <s-unordered-list>
                  {whitelist.map((p) => (
                    <s-list-item key={p.id}>
                      {p.title}{" "}
                      <button
                        type="button"
                        onClick={() => toggleProduct(p.id, p.title)}
                      >
                        Remove
                      </button>
                    </s-list-item>
                  ))}
                </s-unordered-list>
              )}
              <s-stack direction="inline" gap="base">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products…"
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #c9cccf",
                    borderRadius: "4px",
                    fontSize: "14px",
                    width: "280px",
                  }}
                />
                <s-button onClick={searchProducts} variant="secondary">
                  Search
                </s-button>
              </s-stack>
              {results.length > 0 && (
                <s-unordered-list>
                  {results
                    .filter((r) => !whitelist.some((p) => p.id === r.id))
                    .map((r) => (
                      <s-list-item key={r.id}>
                        {r.title}{" "}
                        <button
                          type="button"
                          onClick={() => toggleProduct(r.id, r.title)}
                        >
                          Add
                        </button>
                      </s-list-item>
                    ))}
                </s-unordered-list>
              )}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Quote form">
        <s-checkbox
          label="Make phone optional"
          checked={settings.form.customer_phone_optional}
          onChange={(e: Event) =>
            setSettings((prev) => ({
              ...prev,
              form: {
                ...prev.form,
                customer_phone_optional: (e.target as HTMLInputElement).checked,
              },
            }))
          }
        />
        <s-checkbox
          label="Make company optional"
          checked={settings.form.company_optional}
          onChange={(e: Event) =>
            setSettings((prev) => ({
              ...prev,
              form: {
                ...prev.form,
                company_optional: (e.target as HTMLInputElement).checked,
              },
            }))
          }
        />
      </s-section>

      <s-button variant="primary" onClick={save}>
        Save settings
      </s-button>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
