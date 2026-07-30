import { Banknote, Hotel } from "lucide-react";
import { FormField, SectionCard } from "./BusinessTripShared";
import { businessTripUi } from "./businessTripUi";
import {
    formatAccommodationAmountInput,
    parseAccommodationAmount,
} from "./businessTripAccommodationModel";

export default function BusinessTripAccommodationSection({
    error = "",
    onChange,
    showError = false,
    value,
}) {
    const requestedAmount = Number(value?.requestedAmount ?? 0);

    return (
        <SectionCard icon={Hotel} title="Pengajuan Akomodasi">
            <FormField
                icon={Banknote}
                error={showError ? error : ""}
            >
                <input
                    value={formatAccommodationAmountInput(requestedAmount)}
                    inputMode="numeric"
                    placeholder="Rp 0"
                    onChange={(event) =>
                        onChange({
                            ...value,
                            requestedAmount: parseAccommodationAmount(
                                event.target.value,
                            ),
                        })
                    }
                    className={`${businessTripUi.input} ${
                        showError && error ? businessTripUi.inputError : ""
                    }`}
                />
            </FormField>
        </SectionCard>
    );
}
