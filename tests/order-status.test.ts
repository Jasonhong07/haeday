import { describe, expect, it } from "vitest";
import { orderState, ORDER_COPY, refundStatusForDisplay } from "../src/lib/order-status";

it("later failed external refund cannot hide an active service refund", () => {
  expect(refundStatusForDisplay([{ status: "failed" }, { status: "pending" }])).toBe("pending");
  expect(refundStatusForDisplay([{ status: "pending" }, { status: "requires_action" }])).toBe("requires_action");
  expect(refundStatusForDisplay([])).toBeNull();
});

describe("customer order status: never imply a refund or charge outcome without evidence", () => {
  const base = { paymentStatus: "paid", fulfillmentStatus: "delivered", hasReading: true };
  it("a failed refund restores payment to paid but must still show attention on a delivered order", () => {
    expect(orderState({ ...base, refundStatus: "failed" })).toBe("refund_attention");
  });
  it("a delivered reading does not hide a pending refund", () => {
    expect(orderState({ ...base, paymentStatus: "refund_pending", refundStatus: "pending" })).toBe("refund_pending");
  });
  it("provider-confirmed refund wins over a failed generation", () => {
    expect(orderState({ ...base, paymentStatus: "refunded", fulfillmentStatus: "failed", refundStatus: "succeeded" })).toBe("refunded");
  });
  it.each(["failed", "canceled", "requires_action"])("refund %s requires attention instead of claiming success", refundStatus => {
    expect(orderState({ ...base, paymentStatus: "refund_pending", refundStatus })).toBe("refund_attention");
  });
  it.each(["requested", "unknown"])("refund %s remains unconfirmed", refundStatus => {
    expect(orderState({ ...base, refundStatus })).toBe("refund_pending");
  });
  it("failed generation without a refund does not invent one", () => {
    expect(orderState({ ...base, fulfillmentStatus: "failed", hasReading: false })).toBe("failed");
  });
  it("partial refund is not a full refund, even when the reading was delivered", () => {
    expect(orderState({ ...base, paymentStatus: "partially_refunded", refundStatus: "succeeded" })).toBe("partially_refunded");
  });
  it("open and expired checkouts do not claim the buyer was never charged", () => {
    for (const state of ["awaiting_payment", "expired"] as const) expect(ORDER_COPY[state][1]).not.toMatch(/nothing was charged/i);
  });
  it("missing reading cannot produce a ready link state", () => {
    expect(orderState({ ...base, hasReading: false })).toBe("processing");
  });
});
