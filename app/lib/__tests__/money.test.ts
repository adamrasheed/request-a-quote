import { describe, expect, it } from "vitest";
import {
  centsToDecimal,
  centsToNumber,
  decimalToCents,
  formatCurrency,
  numberToCents,
} from "../money";

describe("money conversions", () => {
  it("converts cents to decimal strings for Shopify GraphQL", () => {
    expect(centsToDecimal(1234)).toBe("12.34");
    expect(centsToDecimal(1900)).toBe("19.00");
    expect(centsToDecimal(0)).toBe("0.00");
  });

  it("parses decimal strings to cents without float drift", () => {
    expect(decimalToCents("12.34")).toBe(1234);
    expect(decimalToCents("19.00")).toBe(1900);
    expect(decimalToCents("0.10")).toBe(10);
    expect(decimalToCents("1234.56")).toBe(123456);
    expect(decimalToCents("0.005")).toBe(1);
  });

  it("rounds float inputs safely", () => {
    expect(numberToCents(12.34)).toBe(1234);
    expect(numberToCents(19.0)).toBe(1900);
    expect(numberToCents(null)).toBe(0);
    expect(numberToCents(undefined)).toBe(0);
  });

  it("converts cents to display numbers", () => {
    expect(centsToNumber(1234)).toBe(12.34);
    expect(centsToNumber(null)).toBe(0);
  });

  it("handles invalid currency codes with a USD fallback", () => {
    expect(formatCurrency(1234, { currencyCode: "NOPE" })).toBe("$12.34");
  });

  it("formats with the requested currency", () => {
    expect(formatCurrency(1234, { currencyCode: "EUR" })).toBe("€12.34");
  });
});
