const MAX_UPLOAD_BYTES = 80 * 1024;
const MAX_DIMENSION = 1280;
const MIN_QUALITY = 0.4;

const canvasToBlob = (canvas, quality) =>
    new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });

export const compressJobPhotoFile = async (
    file,
    {
        maxBytes = MAX_UPLOAD_BYTES,
        maxDimension = MAX_DIMENSION,
        minQuality = MIN_QUALITY,
    } = {},
) => {
    if (!file || !String(file.type || "").startsWith("image/")) return file;

    const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => resolve(event.target.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = dataUrl;
    });

    let scale = 1;
    const maxSide = Math.max(img.width, img.height);
    if (maxSide > maxDimension) {
        scale = maxDimension / maxSide;
    }

    let quality = 0.8;
    let currentBlob = null;
    let width = Math.round(img.width * scale);
    let height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    const render = async () => {
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        currentBlob = await canvasToBlob(canvas, quality);
    };

    await render();

    let safety = 0;
    while (currentBlob && currentBlob.size > maxBytes && safety < 10) {
        safety += 1;
        if (quality > minQuality) {
            quality = Math.max(minQuality, quality - 0.1);
        } else {
            width = Math.max(1, Math.round(width * 0.85));
            height = Math.max(1, Math.round(height * 0.85));
        }
        await render();
    }

    const finalBlob = currentBlob || file;
    return new File([finalBlob], file.name, { type: "image/jpeg" });
};

export const uploadJobPhotoFile = async ({
    supabaseClient,
    userId,
    folderName,
    file,
}) => {
    if (!supabaseClient) throw new Error("Supabase client tidak tersedia.");
    if (!userId) throw new Error("User belum login.");
    if (!file) throw new Error("File belum dipilih.");

    if (!navigator.onLine) {
        throw new Error("Tidak ada koneksi internet.");
    }

    const compressedFile = await compressJobPhotoFile(file);
    const ext = String(compressedFile.name ?? "")
        .split(".")
        .pop()
        ?.toLowerCase() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const uploadPath = `${userId}/${folderName}/${fileName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from("job-photos")
        .upload(uploadPath, compressedFile, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabaseClient.storage
        .from("job-photos")
        .getPublicUrl(uploadPath);

    return {
        url: publicData?.publicUrl ?? "",
        path: uploadPath,
        name: compressedFile.name ?? file.name ?? fileName,
        type: compressedFile.type ?? file.type ?? "",
        size: compressedFile.size ?? file.size ?? null,
    };
};
