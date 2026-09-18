import assert from "node:assert/strict";
import test from "node:test";
import {
    assertReimbursementAggregate,
    groupReimbursementsByRequester,
    summarizeReimbursements,
    validateApprovedAmount,
} from "../src/services/reimbursementAggregation.js";

const approvedUnpaid = {
    id: "approved-unpaid",
    requester_id: "asep",
    status: "approved",
    claim_amount: 200_000,
    approved_amount: 175_000,
    payment_status: "unpaid",
    created_at: "2026-09-18T08:00:00.000Z",
};

test("summary follows individual reimbursement approval and payment states", () => {
    const summary = summarizeReimbursements([
        {
            id: "pending",
            requester_id: "asep",
            status: "pending",
            claim_amount: 100_000,
            approved_amount: null,
            payment_status: "unpaid",
        },
        approvedUnpaid,
        {
            id: "approved-paid",
            requester_id: "asep",
            status: "approved",
            claim_amount: 50_000,
            approved_amount: 50_000,
            payment_status: "paid",
            transfer_proof_url: "https://example.test/proof.jpg",
        },
        {
            id: "rejected",
            requester_id: "asep",
            status: "rejected",
            claim_amount: 100_000,
            approved_amount: null,
            payment_status: "unpaid",
        },
    ]);

    assert.deepEqual(
        {
            totalReimburse: summary.totalReimburse,
            approvedAmount: summary.approvedAmount,
            unpaidAmount: summary.unpaidAmount,
        },
        {
            totalReimburse: 450_000,
            approvedAmount: 225_000,
            unpaidAmount: 175_000,
        },
    );
    assert.equal(summary.pending, 1);
    assert.equal(summary.approved, 2);
    assert.equal(summary.rejected, 1);
});

test("group status is derived from every child and reuses the same aggregate", () => {
    const groups = groupReimbursementsByRequester([
        approvedUnpaid,
        {
            id: "pending",
            requester_id: "asep",
            status: "pending",
            claim_amount: 100_000,
            approved_amount: null,
            payment_status: "unpaid",
            created_at: "2026-09-17T08:00:00.000Z",
        },
        {
            id: "rejected",
            requester_id: "asep",
            status: "rejected",
            claim_amount: 25_000,
            approved_amount: null,
            payment_status: "unpaid",
            created_at: "2026-09-16T08:00:00.000Z",
        },
    ]);

    assert.equal(groups.length, 1);
    assert.equal(groups[0].status, "partial_reviewed");
    assert.deepEqual(
        {
            totalReimburse: groups[0].totalReimburse,
            approvedAmount: groups[0].approvedAmount,
            unpaidAmount: groups[0].unpaidAmount,
        },
        assertReimbursementAggregate({
            totalReimburse: 325_000,
            approvedAmount: 175_000,
            unpaidAmount: 175_000,
        }),
    );
});

test("invalid approval and aggregate values are rejected instead of clamped", () => {
    assert.throws(
        () =>
            validateApprovedAmount({
                claimAmount: 2_476_693,
                approvedAmount: 2_476_695,
            }),
        /tidak boleh melebihi nominal klaim/i,
    );
    assert.throws(
        () =>
            summarizeReimbursements([
                {
                    ...approvedUnpaid,
                    approved_amount: 200_001,
                    claim_amount: 200_000,
                },
            ]),
        /tidak boleh melebihi nominal klaim/i,
    );
    assert.throws(
        () =>
            assertReimbursementAggregate({
                totalReimburse: 100,
                approvedAmount: 80,
                unpaidAmount: 81,
            }),
        /belum dibayar melebihi total disetujui/i,
    );
});
