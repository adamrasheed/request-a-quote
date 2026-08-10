import "@shopify/shopify-app-react-router/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-react-router/server";
import { supabaseSessionStorage } from "./lib/session-storage.server";
import { ensureShopExists, markShopInstalled } from "./lib/shops.server";
import { PRO_PLAN } from "./lib/plans";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const shopify = shopifyApp({
  apiKey: requireEnv("SHOPIFY_API_KEY"),
  apiSecretKey: requireEnv("SHOPIFY_API_SECRET"),
  appUrl: requireEnv("SHOPIFY_APP_URL"),
  scopes: process.env.SCOPES?.split(","),
  apiVersion: ApiVersion.July26,
  distribution: AppDistribution.AppStore,
  sessionStorage: supabaseSessionStorage,
  billing: {
    [PRO_PLAN]: {
      trialDays: 14,
      lineItems: [
        {
          amount: 19.0,
          currencyCode: "USD",
          interval: BillingInterval.Every30Days,
        },
      ],
    },
  },
  hooks: {
    afterAuth: async ({ session }) => {
      await ensureShopExists(session.shop);
      // afterAuth also runs every time an installed merchant opens the app, so
      // the install state has to be claimed rather than assumed.
      await markShopInstalled(session.shop);
    },
  },
  future: {
    expiringOfflineAccessTokens: true,
  },
});

export default shopify;
export const apiVersion = ApiVersion.July26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
