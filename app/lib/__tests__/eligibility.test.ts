import { describe, expect, it } from "vitest";
import { isProductEligible } from "../eligibility";
import { DEFAULT_SETTINGS } from "../settings";

describe("isProductEligible", () => {
  it("returns false when quotes are disabled", () => {
    const settings = { ...DEFAULT_SETTINGS, enabled: false };
    expect(isProductEligible({ id: "gid://shopify/Product/1" }, settings)).toBe(
      false,
    );
  });

  it("returns true for all products in 'all' mode", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      eligibility: { mode: "all" as const, whitelistIds: [] },
    };
    expect(isProductEligible({ id: "gid://shopify/Product/1" }, settings)).toBe(
      true,
    );
  });

  it("only allows whitelisted products in whitelist mode", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      eligibility: {
        mode: "whitelist" as const,
        whitelistIds: ["gid://shopify/Product/2"],
      },
    };
    expect(isProductEligible({ id: "gid://shopify/Product/1" }, settings)).toBe(
      false,
    );
    expect(isProductEligible({ id: "gid://shopify/Product/2" }, settings)).toBe(
      true,
    );
  });
});
