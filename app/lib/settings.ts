import type { QuoteSettings } from "../types/db";

export const DEFAULT_SETTINGS: QuoteSettings = {
  enabled: true,
  eligibility: {
    mode: "all",
    whitelistIds: [],
  },
  form: {
    customer_phone_optional: true,
    company_optional: true,
  },
  show_price: true,
  button_label: "Request a Quote",
};

export function normalizeSettings(raw: unknown): QuoteSettings {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const eligibility = (obj.eligibility ?? {}) as Record<string, unknown>;
  const form = (obj.form ?? {}) as Record<string, unknown>;

  const whitelistIds = Array.isArray(eligibility.whitelistIds)
    ? (eligibility.whitelistIds as unknown[]).filter(
        (id): id is string => typeof id === "string",
      )
    : [];

  return {
    enabled:
      typeof obj.enabled === "boolean" ? obj.enabled : DEFAULT_SETTINGS.enabled,
    eligibility: {
      mode: eligibility.mode === "whitelist" ? "whitelist" : "all",
      whitelistIds,
    },
    form: {
      customer_phone_optional:
        typeof form.customer_phone_optional === "boolean"
          ? form.customer_phone_optional
          : DEFAULT_SETTINGS.form.customer_phone_optional,
      company_optional:
        typeof form.company_optional === "boolean"
          ? form.company_optional
          : DEFAULT_SETTINGS.form.company_optional,
    },
    show_price:
      typeof obj.show_price === "boolean"
        ? obj.show_price
        : DEFAULT_SETTINGS.show_price,
    button_label:
      typeof obj.button_label === "string" && obj.button_label.trim().length > 0
        ? obj.button_label.trim().slice(0, 60)
        : DEFAULT_SETTINGS.button_label,
  };
}
