import { expect, it } from "vitest";
import { refundFeedback } from "../src/lib/refund-feedback";
it("confirmed success is the only successful completion message", () => {
  expect(refundFeedback({ ok: true, status: "succeeded" })).toEqual({ status: "refunded" });
});
it.each(["failed", "canceled", "requires_action"])("%s is attention, not processing or completed", status => {
  expect(refundFeedback({ ok: true, status })).toEqual({ status: "needs_attention" });
});
it.each(["requested", "pending", "unknown"])("%s cannot claim a completed refund", status => {
  expect(refundFeedback({ ok: true, status })).toEqual({ status: "pending" });
});
it("a free order is not falsely reported as money refunded", () => {
  expect(refundFeedback({ ok: false, error: "nothing_to_refund" })).toEqual({ error: "nothing_to_refund" });
});
it("an open dispute is not confused with missing ownership", () => {
  expect(refundFeedback({ ok: false, error: "disputed" })).toEqual({ error: "disputed" });
});
