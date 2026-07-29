/* eslint-disable react-refresh/only-export-components */
import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useState,
} from "react";
import { useAuth } from "../../context/useAuth";
import {
    createBusinessTripDraft,
    deleteBusinessTripDraft,
    getBusinessTripById,
    getBusinessTripStatusCounts,
    getMyBusinessTrips,
    loadBusinessTripProjects,
    submitBusinessTrip,
    updateBusinessTripDraft,
} from "../../services/businessTripService";
import { parseAccommodationAmount } from "./businessTripAccommodationModel";
import { BUSINESS_TRIP_STATUS } from "./businessTripConstants";

const todayKey = () => new Date().toISOString().slice(0, 10);

const createLocalId = (prefix) => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const createEmptyAccommodationRequest = () => ({
    id: createLocalId("business-trip-accommodation"),
    requestedAmount: 0,
});

export const normalizeAccommodationRequest = (value) => ({
    id: value?.id ?? createLocalId("business-trip-accommodation"),
    requestedAmount: parseAccommodationAmount(
        value?.requestedAmount ?? value?.requested_amount ?? 0,
    ),
});

export const createEmptyBusinessTrip = (requesterName = "") => ({
    id: createLocalId("business-trip-local"),
    businessTripNo: "BT-DRAFT",
    createdAt: new Date().toISOString(),
    dateMode: "single",
    tripDate: todayKey(),
    startDate: "",
    endDate: "",
    title: "",
    projectId: "",
    initiator: "self",
    initiatorName: requesterName,
    requesterName,
    status: BUSINESS_TRIP_STATUS.DRAFT,
    rejectionReason: "",
    agendas: [],
    accommodationRequest: createEmptyAccommodationRequest(),
});

const getDisplayName = (profile, user) =>
    `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim() ||
    user?.user_metadata?.full_name?.trim() ||
    user?.email ||
    "User";

const initialStatusCounts = {
    [BUSINESS_TRIP_STATUS.DRAFT]: 0,
    [BUSINESS_TRIP_STATUS.PENDING_APPROVAL]: 0,
    [BUSINESS_TRIP_STATUS.REJECTED]: 0,
    "needs-realization": 0,
    [BUSINESS_TRIP_STATUS.REALIZATION_SUBMITTED]: 0,
    Settlement: 0,
    [BUSINESS_TRIP_STATUS.COMPLETED]: 0,
};

const BusinessTripDraftContext = createContext(null);

export function BusinessTripDraftProvider({ children }) {
    const { user, profile } = useAuth();
    const userId = user?.id;
    const requesterName = getDisplayName(profile, user);
    const [businessTrips, setBusinessTrips] = useState([]);
    const [projects, setProjects] = useState([]);
    const [statusCounts, setStatusCounts] = useState(initialStatusCounts);
    const [totalCount, setTotalCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [draft, setDraftState] = useState(() =>
        createEmptyBusinessTrip(requesterName),
    );

    const upsertTrip = useCallback((nextTrip) => {
        setBusinessTrips((current) => {
            const exists = current.some((trip) => trip.id === nextTrip.id);
            if (!exists) return [nextTrip, ...current];
            return current.map((trip) => (trip.id === nextTrip.id ? nextTrip : trip));
        });
        setDraftState(nextTrip);
        return nextTrip;
    }, []);

    const refreshProjects = useCallback(async () => {
        const nextProjects = await loadBusinessTripProjects();
        setProjects(nextProjects);
        return nextProjects;
    }, []);

    const loadBusinessTrips = useCallback(
        async (options = {}) => {
            if (!userId) {
                setBusinessTrips([]);
                setTotalCount(0);
                setStatusCounts(initialStatusCounts);
                return {
                    items: [],
                    projects: [],
                    total: 0,
                };
            }

            setLoading(true);
            setError("");
            try {
                const [listResult, countsResult] = await Promise.all([
                    getMyBusinessTrips({
                        ...options,
                        requesterId: userId,
                    }),
                    getBusinessTripStatusCounts({
                        startDate: options.startDate,
                        endDate: options.endDate,
                        requesterId: userId,
                    }),
                ]);
                setBusinessTrips(listResult.items);
                setProjects(listResult.projects);
                setTotalCount(listResult.total);
                setStatusCounts({ ...initialStatusCounts, ...countsResult });
                return listResult;
            } catch (fetchError) {
                console.error("[BusinessTrip] failed to load trips", fetchError);
                setError(fetchError.message ?? "Data Business Trip gagal dimuat.");
                setBusinessTrips([]);
                setTotalCount(0);
                throw fetchError;
            } finally {
                setLoading(false);
            }
        },
        [userId],
    );

    const loadBusinessTripById = useCallback(
        async (tripId) => {
            setLoading(true);
            setError("");
            try {
                const result = await getBusinessTripById(tripId);
                setProjects(result.projects);
                return upsertTrip(result.trip);
            } catch (fetchError) {
                console.error("[BusinessTrip] failed to load trip detail", fetchError);
                setError(fetchError.message ?? "Detail Business Trip gagal dimuat.");
                throw fetchError;
            } finally {
                setLoading(false);
            }
        },
        [upsertTrip],
    );

    const createTrip = useCallback(async () => {
        if (!userId) throw new Error("User belum siap.");
        const nextTrip = await createBusinessTripDraft({ requesterId: userId });
        nextTrip.initiatorName = nextTrip.initiatorName || requesterName;
        return upsertTrip(nextTrip).id;
    }, [requesterName, upsertTrip, userId]);

    const updateTrip = useCallback(
        (tripId, updater) => {
            let nextTrip = null;
            setBusinessTrips((current) =>
                current.map((trip) => {
                    if (trip.id !== tripId) return trip;
                    nextTrip =
                        typeof updater === "function"
                            ? updater(trip)
                            : { ...trip, ...updater };
                    return nextTrip;
                }),
            );
            setDraftState((current) => {
                if (current.id !== tripId) return current;
                return typeof updater === "function"
                    ? updater(current)
                    : { ...current, ...updater };
            });
        },
        [],
    );

    const saveTripDraft = useCallback(
        async (trip) => {
            const savedTrip = await updateBusinessTripDraft({ trip });
            return upsertTrip(savedTrip);
        },
        [upsertTrip],
    );

    const submitTripRequest = useCallback(
        async (trip) => {
            const submittedTrip = await submitBusinessTrip({ trip });
            return upsertTrip(submittedTrip);
        },
        [upsertTrip],
    );

    const deleteTrip = useCallback(async (tripId) => {
        await deleteBusinessTripDraft(tripId);
        setBusinessTrips((current) => current.filter((trip) => trip.id !== tripId));
    }, []);

    const setDraft = useCallback((updater) => {
        setDraftState((current) =>
            typeof updater === "function" ? updater(current) : updater,
        );
    }, []);

    const getProjectById = useCallback(
        (projectId) =>
            projects.find((project) => project.id === projectId) ?? null,
        [projects],
    );

    const selectedProject = useMemo(
        () => getProjectById(draft.projectId),
        [draft.projectId, getProjectById],
    );

    const value = useMemo(
        () => ({
            businessTrips,
            createTrip,
            deleteTrip,
            draft,
            error,
            getProjectById,
            loadBusinessTripById,
            loadBusinessTrips,
            loading,
            projects,
            refreshProjects,
            saveTripDraft,
            selectedProject,
            setDraft,
            statusCounts,
            submitTripRequest,
            totalCount,
            updateTrip,
        }),
        [
            businessTrips,
            createTrip,
            deleteTrip,
            draft,
            error,
            getProjectById,
            loadBusinessTripById,
            loadBusinessTrips,
            loading,
            projects,
            refreshProjects,
            saveTripDraft,
            selectedProject,
            setDraft,
            statusCounts,
            submitTripRequest,
            totalCount,
            updateTrip,
        ],
    );

    return (
        <BusinessTripDraftContext.Provider value={value}>
            {children}
        </BusinessTripDraftContext.Provider>
    );
}

export function useBusinessTripDraft() {
    const context = useContext(BusinessTripDraftContext);
    if (!context) {
        throw new Error(
            "useBusinessTripDraft must be used inside BusinessTripDraftProvider",
        );
    }
    return context;
}
