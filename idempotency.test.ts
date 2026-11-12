import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { createPayment } from "@/lib/payments/service";
import { eventsOf, resetDb } from "./helpers";

describe("payment creation idempotency", () => {
  beforeEach(resetDb);

  it("a retry with the same idempotency key returns the original payment", async () => {
    const key = randomUUID();
    const first = await createPayment({
      recipient: "Nina Patel",
      amount: "24.50",
      scenario: "stall", // never settles, so no timers fire during tests
      timeoutMs: 10_000,
      idempotencyKey: key,
    });
    const retry = await createPayment({
      recipient: "Nina Patel",
      amount: "24.50",
      scenario: "stall",
      timeoutMs: 10_000,
      idempotencyKey: key,
    });

    expect(first.reused).toBe(false);
    expect(retry.reused).toBe(true);
    expect(retry.payment.id).toBe(first.payment.id);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("two parallel creates with the same key still produce one payment", async () => {
    const key = randomUUID();
    const input = {
      recipient: "Marcus Lee",
      amount: "10.00",
      scenario: "stall",
      timeoutMs: 10_000,
      idempotencyKey: key,
    };
    const [a, b] = await Promise.all([
      createPayment(input),
      createPayment(input),
    ]);
    expect(a.payment.id).toBe(b.payment.id);
    expect([a.reused, b.reused].sort()).toEqual([false, true]);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("a created payment moves initiated -> pending with timestamps", async () => {
    const { payment } = await createPayment({
      recipient: "Acme Corp",
      amount: "99.99",
      scenario: "stall",
      timeoutMs: 10_000,
      idempotencyKey: randomUUID(),
    });

    expect(payment.state).toBe("pending");

    const events = await eventsOf(payment.id);
    const states = events.map((e) => `${e.fromState ?? "∅"}->${e.toState}`);
    expect(states).toEqual(["∅->initiated", "initiated->pending"]);
    // Every transition carries a timestamp.
    for (const e of events) expect(e.createdAt).toBeInstanceOf(Date);
  });

  it("records a device-network annotation when the scenario was auto-selected", async () => {
    const { payment } = await createPayment({
      recipient: "Nina Patel",
      amount: "12.00",
      scenario: "stall", // resolves no timers, even with a label attached
      timeoutMs: 10_000,
      idempotencyKey: randomUUID(),
      networkLabel: "Weak 2G · 850 ms ping",
    });

    expect(payment.networkLabel).toBe("Weak 2G · 850 ms ping");
    const titles = (await eventsOf(payment.id)).map((e) => e.title);
    expect(titles).toContain("Device network detected");
  });

  it("leaves networkLabel null for manual scenario picks", async () => {
    const { payment } = await createPayment({
      recipient: "Nina Patel",
      amount: "12.00",
      scenario: "stall",
      timeoutMs: 10_000,
      idempotencyKey: randomUUID(),
    });
    expect(payment.networkLabel).toBeNull();
  });

  it("creates a payment addressed by phone number", async () => {
    const { payment } = await createPayment({
      recipient: "+91 98765 43210", // Nina Patel's number
      amount: "250.00",
      scenario: "stall",
      idempotencyKey: randomUUID(),
    });
    // Known number resolves to the contact's name, number stored separately.
    expect(payment.recipient).toBe("Nina Patel");
    expect(payment.recipientPhone).toBe("9876543210");
  });

  it("creates a payment for an unknown number", async () => {
    const { payment } = await createPayment({
      recipient: "9000000001",
      amount: "75.50",
      scenario: "stall",
      idempotencyKey: randomUUID(),
    });
    expect(payment.recipient).toBe("+91 90000 00001");
    expect(payment.recipientPhone).toBe("9000000001");
  });

  it("rejects an invalid phone number", async () => {
    await expect(
      createPayment({
        recipient: "12345678",
        amount: "10.00",
        scenario: "stall",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("10-digit");
  });

  it("validates input", async () => {
    await expect(
      createPayment({
        recipient: "X",
        amount: "10.00",
        scenario: "stall",
        timeoutMs: 10_000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("Enter a recipient name");
    await expect(
      createPayment({
        recipient: "Nina Patel",
        amount: "-5",
        scenario: "stall",
        timeoutMs: 10_000,
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow("amount");
  });
});
