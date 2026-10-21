import { describe, expect, it } from "vitest";
import { phoneLabel, statusLabel } from "../app/status";

describe("statusLabel", () => {
  it("capitalises and spaces API status words", () => {
    expect(statusLabel("accepted")).toBe("Accepted");
    expect(statusLabel("Paid")).toBe("Paid");
    expect(statusLabel("partially_paid")).toBe("Partially paid");
    expect(statusLabel(undefined)).toBe("Unknown");
  });
});

describe("phoneLabel", () => {
  it("formats US E.164 numbers and leaves others alone", () => {
    expect(phoneLabel("+14155550107")).toBe("(415) 555-0107");
    expect(phoneLabel("+442071838750")).toBe("+442071838750");
    expect(phoneLabel(undefined)).toBe("");
  });
});
