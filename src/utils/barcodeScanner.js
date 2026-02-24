const FALLBACK_READERS = [
    "code_128_reader",
    "code_39_reader",
    "ean_reader",
    "ean_8_reader",
    "upc_reader",
    "upc_e_reader",
    "codabar_reader",
];

const readFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });

const detectWithNative = async (file) => {
    if (!("BarcodeDetector" in window)) return "";
    const bitmap = await createImageBitmap(file);
    const detector = new window.BarcodeDetector({
        formats: ["code_128", "code_39", "ean_13", "ean_8", "qr_code"],
    });
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue ?? "";
};

const detectWithQuagga = async (file) => {
    const module = await import("https://esm.sh/@ericblade/quagga2@1.8.4");
    const Quagga = module?.default ?? module;
    const src = await readFileAsDataUrl(file);

    return new Promise((resolve) => {
        Quagga.decodeSingle(
            {
                src,
                numOfWorkers: 0,
                locate: true,
                decoder: { readers: FALLBACK_READERS },
            },
            (result) => {
                resolve(result?.codeResult?.code ?? "");
            },
        );
    });
};

export const scanBarcodeFromFile = async (file) => {
    if (!file) return "";
    try {
        const nativeResult = await detectWithNative(file);
        if (nativeResult) return nativeResult;
    } catch {
        // Ignore and continue to fallback decoder.
    }
    try {
        return await detectWithQuagga(file);
    } catch {
        return "";
    }
};

