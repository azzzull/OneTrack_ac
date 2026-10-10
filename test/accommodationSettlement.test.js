import assert from "node:assert/strict";
import test from "node:test";
import {
    hasOpenAccommodationSettlement,
    isAccommodationFullyRealized,
} from "../src/services/accommodationSettlement.js";

test("only fully realized accommodation requests release the next submission", () => {
    const partialRealization = {
        status: "realized",
        approved_amount: 500_000,
        totalRealized: 350_000,
    };
    const completedRealization = {
        status: "realized",
        approved_amount: 500_000,
        totalRealized: 500_000,
    };

    assert.equal(isAccommodationFullyRealized(partialRealization), false);
    assert.equal(hasOpenAccommodationSettlement(partialRealization), true);
    assert.equal(isAccommodationFullyRealized(completedRealization), true);
    assert.equal(hasOpenAccommodationSettlement(completedRealization), false);
});

test("pending requests are blocked and rejected requests are terminal", () => {
    assert.equal(
        hasOpenAccommodationSettlement({
            status: "pending",
            approved_amount: 0,
            totalRealized: 0,
        }),
        true,
    );
    assert.equal(
        hasOpenAccommodationSettlement({
            status: "rejected",
            approved_amount: 0,
            totalRealized: 0,
        }),
        false,
    );
});
