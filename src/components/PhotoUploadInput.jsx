/**
 * PhotoUploadInput - Reusable photo upload component
 * Supports both camera capture and gallery/local file picker
 * Uploads directly to Supabase storage
 */

import React, { useRef, useState, useEffect } from "react";
import { useAuth } from "../context/useAuth";

const PhotoUploadInput = ({
    folderName = "temp",
    onPhotoSelected = () => {},
    onUploadSuccess = () => {},
    photoType = "generic", // for metadata
    disabled = false,
    className = "",
    supabaseClient = null,
}) => {
    const fileInputRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);

    const [isOpen, setIsOpen] = useState(false);
    const [uploadMode, setUploadMode] = useState("gallery"); // gallery or camera
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [previewImage, setPreviewImage] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null); // Store selected file
    const [isUploading, setIsUploading] = useState(false);
    const [uploadMessage, setUploadMessage] = useState("");
    const [messageType, setMessageType] = useState("info"); // info, success, error

    const { user } = useAuth();

    // Cleanup camera on unmount
    useEffect(() => {
        const video = videoRef.current;
        return () => {
            if (video && video.srcObject) {
                video.srcObject.getTracks().forEach((track) => track.stop());
            }
        };
    }, []);

    const MAX_UPLOAD_BYTES = 80 * 1024; // ~80KB target
    const MAX_DIMENSION = 1280;
    const MIN_QUALITY = 0.4;

    const canvasToBlob = (canvas, quality) =>
        new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
        });

    /**
     * Compress image file (target size in KB) with resize + quality loop.
     */
    const compressImage = async (
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
            reader.onload = (e) => resolve(e.target.result);
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

        // Reduce quality first, then scale down if needed (preserve aspect ratio)
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

    /**
     * Start camera capture
     */
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" }, // rear camera for mobile
                audio: false,
            });

            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                setIsCameraActive(true);
                setUploadMode("camera");
            }
        } catch (error) {
            console.error("Failed to access camera:", error);
            setUploadMessage("Camera access denied. Using gallery instead.");
            setMessageType("error");
            setUploadMode("gallery");
        }
    };

    /**
     * Stop camera capture
     */
    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const tracks = videoRef.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    };

    /**
     * Capture frame from video stream
     */
    const capturePhoto = () => {
        if (videoRef.current && canvasRef.current) {
            const context = canvasRef.current.getContext("2d");
            const video = videoRef.current;

            // Set canvas size to match video
            canvasRef.current.width = video.videoWidth;
            canvasRef.current.height = video.videoHeight;

            // Draw video frame to canvas
            context.drawImage(video, 0, 0);

            // Convert to blob
            canvasRef.current.toBlob(
                (blob) => {
                    const file = new File([blob], `photo_${Date.now()}.jpg`, {
                        type: "image/jpeg",
                    });

                    // Show preview
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        setPreviewImage(e.target.result);
                    };
                    reader.readAsDataURL(blob);

                    // Stop camera
                    stopCamera();

                    // Continue with upload flow
                    handlePhotoSelected(file);
                },
                "image/jpeg",
                0.9, // 90% quality
            );
        }
    };

    /**
     * Handle file selection from gallery
     */
    const handleGallerySelect = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            // Show preview
            const reader = new FileReader();
            reader.onload = (e) => {
                setPreviewImage(e.target.result);
            };
            reader.readAsDataURL(file);

            // Store file in state
            setSelectedFile(file);
            handlePhotoSelected(file);
        }
    };

    /**
     * Process selected/captured photo
     */
    const handlePhotoSelected = (file) => {
        onPhotoSelected(file);
        // Don't close modal yet, let user confirm
    };

    /**
     * Confirm and upload the selected photo
     */
    const confirmUpload = async () => {
        if (!previewImage) return;

        try {
            setIsUploading(true);
            setUploadMessage("");

            let fileToUpload;

            if (uploadMode === "camera" && canvasRef.current) {
                // Convert canvas to blob, then compress to target size
                const rawFile = await new Promise((resolve) => {
                    canvasRef.current.toBlob(
                        (blob) => {
                            const file = new File(
                                [blob],
                                `photo_${Date.now()}.jpg`,
                                {
                                    type: "image/jpeg",
                                },
                            );
                            resolve(file);
                        },
                        "image/jpeg",
                        0.9,
                    );
                });
                fileToUpload = await compressImage(rawFile);
            } else if (selectedFile) {
                // Compress gallery file
                fileToUpload = await compressImage(selectedFile);
            }

            if (!fileToUpload) {
                setUploadMessage("No file selected");
                setMessageType("error");
                setIsUploading(false);
                return;
            }

            await performUpload(fileToUpload);
        } catch (error) {
            console.error("Upload error:", error);
            setUploadMessage(`Upload failed: ${error.message}`);
            setMessageType("error");
            setIsUploading(false);
        }
    };

    /**
     * Perform the actual upload
     */
    const performUpload = async (file) => {
        if (!user || !supabaseClient) {
            setUploadMessage("User not authenticated. Please log in.");
            setMessageType("error");
            setIsUploading(false);
            return;
        }

        try {
            // Check online status
            if (!navigator.onLine) {
                setUploadMessage(
                    "No internet connection. Please try again when online.",
                );
                setMessageType("error");
                setIsUploading(false);
                return;
            }

            // Upload to Supabase
            const ext = file.name.split(".").pop() || "jpg";
            const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const uploadPath = `${user.id}/${folderName}/${fileName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from("job-photos")
                .upload(uploadPath, file, { upsert: false });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: publicData } = supabaseClient.storage
                .from("job-photos")
                .getPublicUrl(uploadPath);

            const photoUrl = publicData?.publicUrl;

            // Callback to update parent component
            if (onUploadSuccess && photoUrl) {
                await onUploadSuccess(
                    {
                        userId: user.id,
                        photoType,
                        timestamp: Date.now(),
                    },
                    photoUrl,
                );
            }

            setUploadMessage("✓ Photo uploaded successfully");
            setMessageType("success");

            // Reset UI after success
            setTimeout(() => {
                setPreviewImage(null);
                setSelectedFile(null);
                setUploadMessage("");
                setIsOpen(false);
                setUploadMode("gallery");
                if (fileInputRef.current) {
                    fileInputRef.current.value = "";
                }
            }, 1500);
        } catch (error) {
            console.error("Upload error:", error);
            setUploadMessage(`Error: ${error.message}`);
            setMessageType("error");
        } finally {
            setIsUploading(false);
        }
    };

    /**
     * Cancel upload flow
     */
    const handleCancel = () => {
        stopCamera();
        setPreviewImage(null);
        setSelectedFile(null);
        setUploadMessage("");
        setIsOpen(false);
        setUploadMode("gallery");
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
        setIsUploading(false);
    };

    return (
        <div className={`photo-upload-container ${className}`}>
            {/* Main Button */}
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                disabled={disabled || isUploading}
                className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
            >
                <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                </svg>
                Upload Photo
            </button>

            {/* Modal */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
                        {/* Header */}
                        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-900">
                                Upload Photo
                            </h2>
                            <button
                                type="button"
                                onClick={handleCancel}
                                className="text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg p-2"
                            >
                                <svg
                                    className="w-6 h-6"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M6 18L18 6M6 6l12 12"
                                    />
                                </svg>
                            </button>
                        </div>

                        {/* Mode Tabs */}
                        {!previewImage && (
                            <div className="flex border-b border-slate-200 px-6 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUploadMode("gallery");
                                        stopCamera();
                                    }}
                                    className={`px-4 py-2 font-medium border-b-2 transition ${
                                        uploadMode === "gallery"
                                            ? "border-sky-500 text-sky-600"
                                            : "border-transparent text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    From Gallery
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUploadMode("camera");
                                        startCamera();
                                    }}
                                    className={`px-4 py-2 font-medium border-b-2 transition ${
                                        uploadMode === "camera"
                                            ? "border-sky-500 text-sky-600"
                                            : "border-transparent text-slate-600 hover:text-slate-900"
                                    }`}
                                >
                                    Camera
                                </button>
                            </div>
                        )}

                        {/* Content */}
                        <div className="p-6">
                            {/* Gallery Mode */}
                            {uploadMode === "gallery" && !previewImage && (
                                <div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleGallerySelect}
                                        className="hidden"
                                    />
                                    <button
                                        type="button"
                                        onClick={() =>
                                            fileInputRef.current?.click()
                                        }
                                        className="w-full py-12 border-2 border-dashed border-slate-300 rounded-lg hover:border-sky-500 hover:bg-sky-50 transition flex flex-col items-center justify-center gap-3 cursor-pointer"
                                    >
                                        <svg
                                            className="w-12 h-12 text-slate-400"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={1.5}
                                                d="M12 4v16m8-8H4"
                                            />
                                        </svg>
                                        <p className="text-lg font-medium text-slate-700">
                                            Select a photo
                                        </p>
                                        <p className="text-sm text-slate-500">
                                            Tap to browse your gallery
                                        </p>
                                    </button>
                                </div>
                            )}

                            {/* Camera Mode */}
                            {uploadMode === "camera" && !previewImage && (
                                <div>
                                    <div className="bg-slate-900 rounded-lg overflow-hidden mb-4">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            className="w-full aspect-video object-cover"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={capturePhoto}
                                        disabled={!isCameraActive}
                                        className="w-full py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-400 text-white font-medium rounded-lg transition"
                                    >
                                        Capture Photo
                                    </button>
                                </div>
                            )}

                            {/* Preview Mode */}
                            {previewImage && (
                                <div>
                                    <div className="mb-4">
                                        <p className="text-sm text-slate-600 mb-2">
                                            Preview:
                                        </p>
                                        <img
                                            src={previewImage}
                                            alt="Preview"
                                            className="w-full rounded-lg max-h-96 object-contain bg-slate-100"
                                        />
                                    </div>

                                    {/* Message */}
                                    {uploadMessage && (
                                        <div
                                            className={`p-3 rounded-lg mb-4 text-sm ${
                                                messageType === "success"
                                                    ? "bg-green-50 text-green-700 border border-green-200"
                                                    : messageType === "error"
                                                      ? "bg-red-50 text-red-700 border border-red-200"
                                                      : "bg-blue-50 text-blue-700 border border-blue-200"
                                            }`}
                                        >
                                            {uploadMessage}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div className="flex gap-3">
                                        <button
                                            type="button"
                                            onClick={handleCancel}
                                            disabled={isUploading}
                                            className="flex-1 py-3 border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg disabled:opacity-50 transition"
                                        >
                                            Retake
                                        </button>
                                        <button
                                            type="button"
                                            onClick={confirmUpload}
                                            disabled={
                                                isUploading || !previewImage
                                            }
                                            className="flex-1 py-3 bg-sky-500 hover:bg-sky-600 disabled:bg-slate-400 text-white font-medium rounded-lg disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
                                        >
                                            {isUploading && (
                                                <svg
                                                    className="animate-spin h-5 w-5"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <circle
                                                        className="opacity-25"
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                        stroke="currentColor"
                                                        strokeWidth="4"
                                                    />
                                                    <path
                                                        className="opacity-75"
                                                        fill="currentColor"
                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                    />
                                                </svg>
                                            )}
                                            {isUploading
                                                ? "Uploading..."
                                                : "Upload"}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Hidden canvas for camera capture */}
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default PhotoUploadInput;
