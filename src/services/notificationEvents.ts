import supabase from "../supabaseClient";

export const NOTIFICATION_EVENT_TYPES = {
    JOB_REQUESTED: "job_requested",
    JOB_CREATED_BY_TECHNICIAN: "job_created_by_technician",
    JOB_TAKEN: "job_taken",
    JOB_STATUS_CHANGED: "job_status_changed",
    ACCOMMODATION_REQUESTED: "accommodation_requested",
    ACCOMMODATION_APPROVED: "accommodation_approved",
    ACCOMMODATION_REJECTED: "accommodation_rejected",
    REALIZATION_NEED_REVIEW: "realization_need_review",
    OVERTIME_REQUESTED: "overtime_requested",
    OVERTIME_APPROVED: "overtime_approved",
    OVERTIME_REJECTED: "overtime_rejected",
    OVERTIME_STATUS_CHANGED: "overtime_status_changed",
    REIMBURSEMENT_REQUESTED: "reimbursement_requested",
    REIMBURSEMENT_APPROVED: "reimbursement_approved",
    REIMBURSEMENT_REJECTED: "reimbursement_rejected",
    LOAN_REQUESTED: "loan_requested",
    LOAN_APPROVED: "loan_approved",
    LOAN_REJECTED: "loan_rejected",
    LOAN_REPAYMENT_CREATED: "loan_repayment_created",
    LOAN_REPAYMENT_APPROVED: "loan_repayment_approved",
    LOAN_REPAYMENT_REJECTED: "loan_repayment_rejected",
    LOAN_DEDUCTED: "loan_deducted",
} as const;

type NotificationEventType =
    (typeof NOTIFICATION_EVENT_TYPES)[keyof typeof NOTIFICATION_EVENT_TYPES];

type NotifyEventPayload = Record<string, unknown> & {
    request_id?: string | null;
    customer_id?: string | null;
    customer_name?: string | null;
    technician_id?: string | null;
    technician_name?: string | null;
    accommodation_id?: string | null;
    amount?: number | string | null;
    status?: string | null;
    overtime_id?: string | null;
    reimbursement_id?: string | null;
    loan_id?: string | null;
    loan_repayment_id?: string | null;
    requester_id?: string | null;
    requester_name?: string | null;
    approved_amount?: number | string | null;
    attendance_id?: string | null;
    duration_minutes?: number | string | null;
};

type TechnicianRecipientRow = {
    technician_id?: string | null;
    profile_id?: string | null;
    user_id?: string | null;
    id?: string | null;
};

type ProfileNameRow = {
    first_name?: string | null;
    last_name?: string | null;
    name?: string | null;
    email?: string | null;
};

const uniqueStrings = (values: Array<string | null | undefined>) =>
    [...new Set(values.map((value) => String(value ?? "").trim()))].filter(
        Boolean,
    );

const isNonEmptyString = (value: unknown): value is string =>
    typeof value === "string" && value.trim() !== "";

export const formatRupiah = (value: unknown) =>
    new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
    }).format(Number(value ?? 0));

const getProfileDisplayName = (profile?: ProfileNameRow | null) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    String(profile?.name ?? "").trim() ||
    String(profile?.email ?? "").trim() ||
    "";

const getTechnicianName = async (technicianId?: unknown) => {
    const id = String(technicianId ?? "").trim();
    if (!id) return "";

    const { data, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, name, email")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        console.warn("[notifyEvent] technician profile lookup skipped:", error.message);
        return "";
    }

    return getProfileDisplayName(data);
};

export const formatStatusLabel = (value: unknown) => {
    const key = String(value ?? "")
        .trim()
        .toLowerCase()
        .replaceAll("-", "_")
        .replaceAll(" ", "_");
    const labels: Record<string, string> = {
        requested: "Menunggu",
        pending: "Pending",
        in_progress: "Dalam Progress",
        completed: "Selesai",
        cancelled: "Dibatalkan",
        approved: "Disetujui",
        rejected: "Ditolak",
        check_in: "Absen Masuk",
        check_out: "Absen Pulang",
        checkout_overtime_eligible: "Checkout Eligible Lembur",
    };
    return labels[key] ?? String(value ?? "-");
};

export const getCustomerUserRecipients = async (customerId?: string | null) => {
    if (!customerId) return [];

    const userIds: string[] = [];

    const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("role", "customer")
        .eq("customer_id", customerId);

    if (profileError) {
        console.warn("[notifyEvent] customer profile lookup skipped:", profileError.message);
    } else {
        userIds.push(...(profiles ?? []).map((profile) => profile.id));
    }

    const { data: customer, error: customerError } = await supabase
        .from("master_customers")
        .select("user_id, email")
        .eq("id", customerId)
        .maybeSingle();

    if (customerError) {
        console.warn("[notifyEvent] master customer lookup skipped:", customerError.message);
    } else {
        if (customer?.user_id) userIds.push(customer.user_id);
        if (customer?.email) {
            const { data: emailProfiles, error: emailProfileError } =
                await supabase
                    .from("profiles")
                    .select("id")
                    .eq("role", "customer")
                    .eq("email", customer.email);

            if (emailProfileError) {
                console.warn(
                    "[notifyEvent] customer email profile lookup skipped:",
                    emailProfileError.message,
                );
            } else {
                userIds.push(...(emailProfiles ?? []).map((profile) => profile.id));
            }
        }
    }

    return uniqueStrings(userIds);
};

export const getAssignedTechnicianRecipients = async ({
    requestId,
    customerId,
}: {
    requestId?: string | null;
    customerId?: string | null;
}) => {
    const userIds: string[] = [];

    if (requestId) {
        const { data: jobTechnicians, error: jobTechniciansError } =
            await supabase
                .from("job_technicians")
                .select("technician_id")
                .eq("job_id", requestId);

        if (jobTechniciansError) {
            console.warn(
                "[notifyEvent] job technician lookup skipped:",
                jobTechniciansError.message,
            );
        } else {
            userIds.push(
                ...((jobTechnicians ?? []) as TechnicianRecipientRow[])
                    .map((item) => item.technician_id)
                    .filter(isNonEmptyString),
            );
        }
    }

    if (userIds.length === 0 && customerId) {
        const { data: assignedTechnicians, error: assignedTechniciansError } =
            await supabase.rpc("get_technicians_for_customer", {
                p_customer_id: customerId,
            });

        if (assignedTechniciansError) {
            console.warn(
                "[notifyEvent] customer technician lookup skipped:",
                assignedTechniciansError.message,
            );
        } else {
            userIds.push(
                ...((assignedTechnicians ?? []) as TechnicianRecipientRow[])
                    .map(
                        (item) =>
                            item.technician_id ??
                            item.profile_id ??
                            item.user_id ??
                            item.id,
                    )
                    .filter(isNonEmptyString),
            );
        }
    }

    if (userIds.length === 0 && customerId) {
        const { data: assignmentRows, error: assignmentRowsError } =
            await supabase
                .from("technician_customer_assignments")
                .select("technician_id")
                .eq("customer_id", customerId)
                .eq("is_active", true);

        if (assignmentRowsError) {
            console.warn(
                "[notifyEvent] direct technician assignment lookup skipped:",
                assignmentRowsError.message,
            );
        } else {
            userIds.push(
                ...((assignmentRows ?? []) as TechnicianRecipientRow[])
                    .map((item) => item.technician_id)
                    .filter(isNonEmptyString),
            );
        }
    }

    if (customerId) {
        const { data: externalTechnicians, error: externalTechniciansError } =
            await supabase
                .from("profiles")
                .select("id")
                .eq("role", "technician")
                .eq("technician_type", "external")
                .eq("customer_id", customerId);

        if (externalTechniciansError) {
            console.warn(
                "[notifyEvent] external technician lookup skipped:",
                externalTechniciansError.message,
            );
        } else {
            userIds.push(
                ...((externalTechnicians ?? []) as TechnicianRecipientRow[])
                    .map((item) => item.id)
                    .filter(isNonEmptyString),
            );
        }
    }

    return uniqueStrings(userIds);
};

const invokePushNotification = async (body: Record<string, unknown>) => {
    console.info("[notifyEvent] resolved payload:", body);
    const { data, error } = await supabase.functions.invoke(
        "send-push-notification",
        { body },
    );
    console.info("[notifyEvent] Edge Function response:", { data, error });
    if (error || data?.success === false) {
        console.warn(
            "[notifyEvent] notification skipped:",
            error?.message ?? data?.message ?? data?.error ?? data,
        );
    }
    return data;
};

export const notifyEvent = async (
    type: NotificationEventType | string,
    payload: NotifyEventPayload = {},
) => {
    console.info("[notifyEvent] called:", { type, payload });

    try {
        const customerName = String(payload.customer_name ?? "customer").trim();
        let technicianName = String(payload.technician_name ?? "").trim();
        if (!technicianName) {
            technicianName = await getTechnicianName(payload.technician_id);
        }
        if (!technicianName) technicianName = "Teknisi";
        const requestId = String(payload.request_id ?? "").trim() || null;
        const accommodationId =
            String(payload.accommodation_id ?? "").trim() || null;
        const amount = payload.amount ?? 0;
        const reimbursementId =
            String(payload.reimbursement_id ?? "").trim() || null;
        const requesterId = String(payload.requester_id ?? "").trim() || null;
        const requesterName =
            String(payload.requester_name ?? "").trim() || technicianName;
        const loanId = String(payload.loan_id ?? "").trim() || null;
        const loanRepaymentId =
            String(payload.loan_repayment_id ?? "").trim() || null;

        if (type === NOTIFICATION_EVENT_TYPES.JOB_REQUESTED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                recipientUserIds: [],
                title: "Job Baru Tersedia",
                body: `Customer ${customerName} membuat permintaan pekerjaan baru.`,
                type,
                referenceTable: "requests",
                referenceId: requestId,
                data: {
                    customer_name: customerName,
                    request_id: requestId,
                    customer_id: payload.customer_id ?? null,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.JOB_CREATED_BY_TECHNICIAN) {
            const customerUserIds = await getCustomerUserRecipients(
                String(payload.customer_id ?? ""),
            );
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                recipientUserIds: customerUserIds,
                title: "Job Baru Dibuat Teknisi",
                body: `${technicianName} membuat pekerjaan baru untuk customer ${customerName}.`,
                type,
                referenceTable: "requests",
                referenceId: requestId,
                data: {
                    technician_name: technicianName,
                    customer_name: customerName,
                    technician_id: payload.technician_id ?? null,
                    customer_id: payload.customer_id ?? null,
                    request_id: requestId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.JOB_TAKEN) {
            const customerUserIds = await getCustomerUserRecipients(
                String(payload.customer_id ?? ""),
            );
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                recipientUserIds: customerUserIds,
                title: "Job Telah Diambil",
                body: `Pekerjaan telah diambil oleh teknisi ${technicianName}.`,
                type,
                referenceTable: "requests",
                referenceId: requestId,
                data: {
                    technician_name: technicianName,
                    technician_id: payload.technician_id ?? null,
                    customer_id: payload.customer_id ?? null,
                    request_id: requestId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.JOB_STATUS_CHANGED) {
            const customerUserIds = await getCustomerUserRecipients(
                String(payload.customer_id ?? ""),
            );
            const statusLabel = formatStatusLabel(payload.status);
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                recipientUserIds: customerUserIds,
                title: "Status Pekerjaan Berubah",
                body: `Status pekerjaan customer ${customerName} telah diperbarui menjadi ${statusLabel} oleh ${technicianName}.`,
                type,
                referenceTable: "requests",
                referenceId: requestId,
                data: {
                    technician_name: technicianName,
                    customer_name: customerName,
                    status: payload.status ?? null,
                    technician_id: payload.technician_id ?? null,
                    customer_id: payload.customer_id ?? null,
                    request_id: requestId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.ACCOMMODATION_REQUESTED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Pengajuan Akomodasi Baru",
                body: `${technicianName} mengajukan akomodasi sebesar ${formatRupiah(amount)} dan menunggu approval.`,
                type,
                referenceTable: "accommodation_requests",
                referenceId: accommodationId,
                data: {
                    technician_name: technicianName,
                    technician_id: payload.technician_id ?? null,
                    amount,
                    accommodation_id: accommodationId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.ACCOMMODATION_APPROVED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([String(payload.technician_id ?? "")]),
                title: "Akomodasi Disetujui",
                body: `Pengajuan akomodasi sebesar ${formatRupiah(amount)} telah disetujui.`,
                type,
                referenceTable: "accommodation_requests",
                referenceId: accommodationId,
                data: {
                    technician_id: payload.technician_id ?? null,
                    amount,
                    accommodation_id: accommodationId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.ACCOMMODATION_REJECTED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([String(payload.technician_id ?? "")]),
                title: "Akomodasi Ditolak",
                body: `Pengajuan akomodasi sebesar ${formatRupiah(amount)} ditolak. Silakan cek catatan approval.`,
                type,
                referenceTable: "accommodation_requests",
                referenceId: accommodationId,
                data: {
                    technician_id: payload.technician_id ?? null,
                    amount,
                    accommodation_id: accommodationId,
                    rejection_note: payload.rejection_note ?? null,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.REALIZATION_NEED_REVIEW) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Realisasi Perlu Dicek",
                body: `${technicianName} telah mengupload realisasi akomodasi sebesar ${formatRupiah(amount)} dan menunggu verifikasi.`,
                type,
                referenceTable: "accommodation_requests",
                referenceId: accommodationId,
                data: {
                    technician_name: technicianName,
                    technician_id: payload.technician_id ?? null,
                    amount,
                    accommodation_id: accommodationId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.OVERTIME_REQUESTED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Pengajuan Lembur Baru",
                body: `${technicianName} mengajukan lembur dan menunggu approval.`,
                type,
                referenceTable: "overtime_requests",
                referenceId: String(payload.overtime_id ?? "").trim() || null,
                data: {
                    technician_name: technicianName,
                    technician_id: payload.technician_id ?? null,
                    overtime_id: payload.overtime_id ?? null,
                    duration_minutes: payload.duration_minutes ?? null,
                },
            });
        }

        if (
            type === NOTIFICATION_EVENT_TYPES.OVERTIME_APPROVED ||
            type === NOTIFICATION_EVENT_TYPES.OVERTIME_REJECTED ||
            type === NOTIFICATION_EVENT_TYPES.OVERTIME_STATUS_CHANGED
        ) {
            const statusLabel = formatStatusLabel(payload.status);
            return invokePushNotification({
                recipientUserIds: uniqueStrings([String(payload.technician_id ?? "")]),
                title:
                    type === NOTIFICATION_EVENT_TYPES.OVERTIME_APPROVED
                        ? "Lembur Disetujui"
                        : type === NOTIFICATION_EVENT_TYPES.OVERTIME_REJECTED
                          ? "Lembur Ditolak"
                          : "Status Lembur Berubah",
                body: `Status pengajuan lembur Anda: ${statusLabel}.`,
                type,
                referenceTable: "overtime_requests",
                referenceId: String(payload.overtime_id ?? "").trim() || null,
                data: {
                    technician_id: payload.technician_id ?? null,
                    overtime_id: payload.overtime_id ?? null,
                    status: payload.status ?? null,
                    duration_minutes: payload.duration_minutes ?? null,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_REQUESTED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Pengajuan Reimburse Baru",
                body: `Ada pengajuan reimburse baru dari ${requesterName} sebesar ${formatRupiah(amount)}.`,
                type,
                referenceTable: "reimbursements",
                referenceId: reimbursementId,
                data: {
                    requester_id: requesterId,
                    requester_name: requesterName,
                    amount,
                    reimbursement_id: reimbursementId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_APPROVED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Reimburse Disetujui",
                body: `Reimburse kamu sebesar ${formatRupiah(amount)} telah disetujui sebesar ${formatRupiah(payload.approved_amount ?? 0)}.`,
                type,
                referenceTable: "reimbursements",
                referenceId: reimbursementId,
                data: {
                    requester_id: requesterId,
                    amount,
                    approved_amount: payload.approved_amount ?? null,
                    reimbursement_id: reimbursementId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.REIMBURSEMENT_REJECTED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Reimburse Ditolak",
                body: `Reimburse kamu ditolak. Alasan: ${payload.rejection_note ?? "Tidak ada catatan."}`,
                type,
                referenceTable: "reimbursements",
                referenceId: reimbursementId,
                data: {
                    requester_id: requesterId,
                    amount,
                    reimbursement_id: reimbursementId,
                    rejection_note: payload.rejection_note ?? null,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_REQUESTED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Pengajuan Pinjaman Baru",
                body: `Ada pengajuan pinjaman baru dari ${requesterName} sebesar ${formatRupiah(amount)}.`,
                type,
                referenceTable: "loans",
                referenceId: loanId,
                data: {
                    requester_id: requesterId,
                    requester_name: requesterName,
                    amount,
                    loan_id: loanId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_APPROVED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Pinjaman Disetujui",
                body: `Pinjaman kamu sebesar ${formatRupiah(amount)} telah disetujui sebesar ${formatRupiah(payload.approved_amount ?? 0)}.`,
                type,
                referenceTable: "loans",
                referenceId: loanId,
                data: {
                    requester_id: requesterId,
                    amount,
                    approved_amount: payload.approved_amount ?? null,
                    loan_id: loanId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_REJECTED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Pinjaman Ditolak",
                body: `Pinjaman kamu ditolak. Alasan: ${payload.rejection_note ?? "Tidak ada catatan."}`,
                type,
                referenceTable: "loans",
                referenceId: loanId,
                data: {
                    requester_id: requesterId,
                    amount,
                    loan_id: loanId,
                    rejection_note: payload.rejection_note ?? null,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_REPAYMENT_CREATED) {
            return invokePushNotification({
                recipientRoles: ["admin", "management"],
                title: "Pembayaran Pinjaman Baru",
                body: `${requesterName} membayar pinjaman sebesar ${formatRupiah(amount)}.`,
                type,
                referenceTable: "loan_repayments",
                referenceId: loanRepaymentId,
                data: {
                    requester_id: requesterId,
                    requester_name: requesterName,
                    amount,
                    loan_id: loanId,
                    loan_repayment_id: loanRepaymentId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_DEDUCTED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Hutang Pinjaman Dikurangi",
                body: `Hutang pinjaman kamu dikurangi sebesar ${formatRupiah(amount)}. Silakan cek riwayat pinjaman.`,
                type,
                referenceTable: "loan_repayments",
                referenceId: loanRepaymentId,
                data: {
                    requester_id: requesterId,
                    amount,
                    loan_id: loanId,
                    loan_repayment_id: loanRepaymentId,
                },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_REPAYMENT_APPROVED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Pembayaran Pinjaman Disetujui",
                body: `Pembayaran pinjaman kamu sebesar ${formatRupiah(amount)} sudah disetujui.`,
                type,
                referenceTable: "loan_repayments",
                referenceId: loanRepaymentId,
                data: { requester_id: requesterId, amount, loan_id: loanId, loan_repayment_id: loanRepaymentId },
            });
        }

        if (type === NOTIFICATION_EVENT_TYPES.LOAN_REPAYMENT_REJECTED) {
            return invokePushNotification({
                recipientUserIds: uniqueStrings([requesterId]),
                title: "Pembayaran Pinjaman Ditolak",
                body: `Pembayaran pinjaman kamu ditolak. Alasan: ${payload.rejection_note ?? "Tidak ada catatan."}`,
                type,
                referenceTable: "loan_repayments",
                referenceId: loanRepaymentId,
                data: {
                    requester_id: requesterId,
                    amount,
                    loan_id: loanId,
                    loan_repayment_id: loanRepaymentId,
                    rejection_note: payload.rejection_note ?? null,
                },
            });
        }

        console.warn("[notifyEvent] Unsupported notification event type:", type);
        return null;
    } catch (error) {
        console.warn("[notifyEvent] failed:", error);
        return null;
    }
};
