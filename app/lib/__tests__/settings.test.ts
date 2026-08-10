import { describe, expect, it } from "vitest";
import { normalizeSettings, DEFAULT_SETTINGS } from "../settings";

describe("normalizeSettings", () => {
  it("returns defaults for an empty document", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid values", () => {
    const raw = {
      enabled: false,
      eligibility: {
        mode: "whitelist",
        whitelistIds: ["gid://shopify/Product/1"],
      },
      form: { customer_phone_optional: false, company_optional: false },
      show_price: false,
      button_label: "Get a Quote",
    };
    expect(normalizeSettings(raw)).toEqual(raw);
  });

  it("drops non-string whitelist ids", () => {
    const settings = normalizeSettings({
      eligibility: {
        mode: "whitelist",
        whitelistIds: ["ok", 42, null, "also-ok"],
      },
    });
    expect(settings.eligibility.whitelistIds).toEqual(["ok", "also-ok"]);
  });

  it("coerces invalid enum and blanks to safe defaults", () => {
    const settings = normalizeSettings({
      eligibility: { mode: "garbage", whitelistIds: [] },
      button_label: "   ",
    });
    expect(settings.eligibility.mode).toBe("all");
    expect(settings.button_label).toBe(DEFAULT_SETTINGS.button_label);
  });

  it("truncates overly long button labels", () => {
    const settings = normalizeSettings({ button_label: "x".repeat(200) });
    expect(settings.button_label.length).toBe(60);
  });
});
