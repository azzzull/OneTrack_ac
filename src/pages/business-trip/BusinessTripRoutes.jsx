import { Navigate, Route, Routes } from "react-router-dom";
import { BusinessTripDraftProvider } from "./BusinessTripDraftContext";
import BusinessTripListPage from "./BusinessTripListPage";
import BusinessTripRealizationPage from "./BusinessTripRealizationPage";
import BusinessTripRequestPage from "./BusinessTripRequestPage";

export default function BusinessTripRoutes() {
    return (
        <BusinessTripDraftProvider>
            <Routes>
                <Route index element={<BusinessTripListPage />} />
                <Route path="form/:tripId" element={<BusinessTripRequestPage />} />
                <Route
                    path="realization/:tripId"
                    element={<BusinessTripRealizationPage />}
                />
                <Route
                    path="agenda"
                    element={<Navigate to="/business-trip" replace />}
                />
                <Route
                    path="review"
                    element={<Navigate to="/business-trip" replace />}
                />
                <Route
                    path="detail"
                    element={<Navigate to="/business-trip" replace />}
                />
                <Route
                    path="realization"
                    element={<Navigate to="/business-trip" replace />}
                />
                <Route
                    path="realization/review"
                    element={<Navigate to="/business-trip" replace />}
                />
                <Route path="*" element={<Navigate to="/business-trip" replace />} />
            </Routes>
        </BusinessTripDraftProvider>
    );
}
