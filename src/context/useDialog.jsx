import { useContext } from "react";
import DialogContext from "./DialogContext";

export function useDialog() {
    const context = useContext(DialogContext);
    if (!context) {
        throw new Error("useDialog must be used inside DialogProvider");
    }
    return context;
}
