import { describe, expect, it } from "vitest";
import {
  isValidPhone,
  resolveRecipient,
  searchContacts,
} from "@/lib/contacts";
import {
  formatMoney,
  formatMoneyCompact,
  parseAmountToCents,
} from "@/lib/format";
import {
  assertTransition,
  canTransition,
  IllegalTransitionError,
  isOverdue,
} from "@/lib/payments/state-machine";

describe("payment state machine", () => {
  it("follows the happy path initiated -> pending -> completed", () => {
    expect(canTransition("initiated", "pending")).toBe(true);
    expect(canTransition("pending", "completed")).toBe(true);
  });

  it("allows refunds from any non-terminal state", () => {
    expect(canTransition("initiated", "refunded")).toBe(true);
    expect(canTransition("pending", "refunded")).toBe(true);
    expect(canTransition("completed", "refunded")).toBe(true);
  });

  it("treats failed and refunded as terminal", () => {
    expect(canTransition("failed", "pending")).toBe(false);
    expect(canTransition("refunded", "pending")).toBe(false);
  });

  it("forbids the race-critical refunded -> completed transition", () => {
    expect(() => assertTransition("refunded", "completed")).toThrow(
      IllegalTransitionError,
    );
  });

  it("forbids resurrecting a completed payment into failed", () => {
    expect(() => assertTransition("completed", "failed")).toThrow(
      IllegalTransitionError,
    );
  });

  it("detects overdue only for in-flight payments past their window", () => {
    const createdAt = new Date(Date.now() - 20_000);
    const base = { createdAt, timeoutMs: 5_000 };
    const now = Date.now();
    expect(isOverdue({ ...base, state: "pending" }, now)).toBe(true);
    expect(isOverdue({ ...base, state: "initiated" }, now)).toBe(true);
    expect(isOverdue({ ...base, state: "completed" }, now)).toBe(false);
    expect(isOverdue({ ...base, state: "refunded" }, now)).toBe(false);
    // Exact boundary counts as overdue.
    const atDeadline = createdAt.getTime() + 5_000;
    expect(isOverdue({ ...base, state: "pending" }, atDeadline)).toBe(true);
    expect(isOverdue({ ...base, state: "pending" }, atDeadline - 1)).toBe(
      false,
    );
  });
});

describe("money parsing", () => {
  it("parses rupee strings into exact integer paise", () => {
    expect(parseAmountToCents("24.50")).toBe(2450);
    expect(parseAmountToCents("0.01")).toBe(1);
    expect(parseAmountToCents("₹1,200")).toBe(120000);
    // lakh-style grouping
    expect(parseAmountToCents("₹1,00,000")).toBe(10_000_000);
  });

  it("rejects invalid or zero amounts", () => {
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("0")).toBeNull();
    expect(parseAmountToCents("1.005")).toBeNull();
  });
});

describe("recipient resolution (name or phone)", () => {
  it("accepts a known contact name", () => {
    expect(resolveRecipient("Nina Patel")).toEqual({
      name: "Nina Patel",
      phone: "9876543210",
    });
  });

  it("resolves a known number to that contact's name", () => {
    expect(resolveRecipient("9876543210")?.name).toBe("Nina Patel");
    // +91 and spacing variants normalize to the same contact
    expect(resolveRecipient("+91 98765 43210")?.name).toBe("Nina Patel");
    expect(resolveRecipient("098765-43210")?.name).toBe("Nina Patel");
  });

  it("accepts an unknown number as a number-only payee", () => {
    expect(resolveRecipient("9000000001")).toEqual({
      name: "+91 90000 00001",
      phone: "9000000001",
    });
  });

  it("accepts a free-text name with no number", () => {
    expect(resolveRecipient("Chai Point")).toEqual({
      name: "Chai Point",
      phone: null,
    });
  });

  it("rejects malformed numbers and 1-character names", () => {
    expect(isValidPhone("12345")).toBe(false); // too short
    expect(isValidPhone("1234567890")).toBe(false); // must start 6-9
    expect(resolveRecipient("98765")).toBeNull();
    expect(resolveRecipient("X")).toBeNull();
    expect(resolveRecipient("")).toBeNull();
  });

  it("searches contacts by name and by digits", () => {
    expect(searchContacts("nina").map((c) => c.name)).toEqual(["Nina Patel"]);
    expect(searchContacts("98123").map((c) => c.name)).toEqual(["Marcus Lee"]);
  });
});

describe("money formatting (INR)", () => {
  it("uses the rupee sign and Indian digit grouping", () => {
    expect(formatMoney(2450)).toContain("₹");
    // 12,455,000 paise = ₹1,24,550.00 — lakh-style grouping
    expect(formatMoney(12_455_000)).toMatch(/₹1,24,550\.00/);
    expect(formatMoneyCompact(100000)).toBe("₹1,000");
  });
});
