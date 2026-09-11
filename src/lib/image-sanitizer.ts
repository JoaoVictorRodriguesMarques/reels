/**
 * Image Sanitizer & JPEG Normalizer for Instagram Reels Cover
 * Meta's Instagram Graph API strictly requires Reel cover images to be in JPEG format (image/jpeg).
 * Non-JPEG formats (like PNG or WebP) are silently ignored or rejected by Meta's container crawler.
 */

export async function ensureJpegCover(file: File): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        URL.revokeObjectURL(url);
        const canvas = document.createElement("canvas");
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          console.warn("[ImageSanitizer] Could not get 2d context, returning original file");
          resolve(file);
          return;
        }

        // Fill background white to avoid black box on transparent PNGs
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.warn("[ImageSanitizer] toBlob returned null, returning original file");
              resolve(file);
              return;
            }

            const rawName = file.name.replace(/\.[^/.]+$/, "");
            const sanitizedName = `${rawName.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;

            const jpegFile = new File([blob], sanitizedName, {
              type: "image/jpeg",
              lastModified: Date.now(),
            });

            console.log(
              `[ImageSanitizer] Converted cover "${file.name}" (${file.type || "unknown"}) -> "${sanitizedName}" (image/jpeg, ${(blob.size / 1024).toFixed(1)} KB) for Meta API compliance`,
            );
            resolve(jpegFile);
          },
          "image/jpeg",
          0.95,
        );
      } catch (err) {
        console.error("[ImageSanitizer] Error during image conversion:", err);
        resolve(file);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      console.warn("[ImageSanitizer] Failed to load image element, returning original file:", err);
      resolve(file);
    };

    img.src = url;
  });
}
