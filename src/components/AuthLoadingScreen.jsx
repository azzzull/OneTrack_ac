import { Loader2 } from "lucide-react";

export default function AuthLoadingScreen() {
    return (
        <div className="min-h-screen bg-sky-100 flex items-center justify-center">
            <div className="rounded-full bg-sky-100 p-8">
                <Loader2 className="h-14 w-14 animate-spin text-sky-400" />
            </div>
        </div>
    );
}
