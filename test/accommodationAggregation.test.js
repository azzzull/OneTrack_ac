import assert from "node:assert/strict";
import test from "node:test";
import { groupAccommodationRequestsByTechnician } from "../src/services/accommodationAggregation.js";

test("accommodation requests are grouped and summarized by technician", () => {
    const groups = groupAccommodationRequestsByTechnician([
        {
            id: "older-request",
            technician_id: "technician-a",
            technician: { name: "Ari" },
            status: "approved",
            requested_at: "2026-10-14T00:00:00.000Z",
            requested_amount: 500_000,
            approved_amount: 400_000,
            totalRealized: 100_000,
            remainingAmount: 300_000,
        },
        {
            id: "latest-request",
            technician_id: "technician-a",
            technician: { name: "Ari" },
            status: "pending",
            requested_at: "2026-10-15T00:00:00.000Z",
            requested_amount: 250_000,
            approved_amount: null,
            totalRealized: 0,
            remainingAmount: 0,
        },
        {
            id: "other-technician",
            technician_id: "technician-b",
            technician: { name: "Bima" },
            status: "realized",
            requested_at: "2026-10-13T00:00:00.000Z",
            requested_amount: 100_000,
            approved_amount: 100_000,
            totalRealized: 100_000,
            remainingAmount: 0,
        },
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].id, "technician-a");
    assert.equal(groups[0].status, "pending");
    assert.equal(groups[0].items[0].id, "latest-request");
    assert.equal(groups[0].requestedAmount, 750_000);
    assert.equal(groups[0].approvedAmount, 400_000);
    assert.equal(groups[0].realizedAmount, 100_000);
    assert.equal(groups[0].remainingAmount, 300_000);
    assert.equal(groups[0].pending, 1);
    assert.equal(groups[0].inRealization, 1);
});
