/**
 * Analyzes an image to determine if it's light or dark
 * Returns true if the image is predominantly light (should use dark text/UI)
 */
export async function isImageLight(imageSrc: string): Promise<boolean> {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";

        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");

                if (!ctx) {
                    console.warn("Could not get canvas context");
                    resolve(false);
                    return;
                }

                const sampleSize = 100;
                canvas.width = sampleSize;
                canvas.height = sampleSize;

                ctx.drawImage(img, 0, 0, sampleSize, sampleSize);

                const imageData = ctx.getImageData(0, 0, sampleSize, sampleSize);
                const data = imageData.data;

                let totalBrightness = 0;
                let pixelCount = 0;

                for (let i = 0; i < data.length; i += 4) {
                    const r = data[i];
                    const g = data[i + 1];
                    const b = data[i + 2];
                    const a = data[i + 3];

                    // Skip transparent pixels
                    if (a < 128) continue;

                    const brightness = (0.299 * r + 0.587 * g + 0.114 * b);
                    totalBrightness += brightness;
                    pixelCount++;
                }

                if (pixelCount === 0) {
                    resolve(false);
                    return;
                }
                const avgBrightness = totalBrightness / pixelCount;

                const isLight = avgBrightness > 127.5;

                console.log(`[Image Analysis] Average brightness: ${avgBrightness.toFixed(1)}, isLight: ${isLight}`);
                resolve(isLight);
            } catch (error) {
                console.error("Error analyzing image:", error);
                resolve(false);
            }
        };

        img.onerror = () => {
            console.error("Error loading image for analysis");
            resolve(false);
        };

        img.src = imageSrc;
    });
}

/**
 * Theme colors based on background brightness
 */
export interface ThemeColors {
    assistantBg: string;
    assistantBorder: string;
    assistantText: string;
    userBg: string;
    userBorder: string;
    userText: string;

    headerOverlay: string;
    footerOverlay: string;
    contentOverlay: string;
}

export function getThemeForBackground(isLight: boolean): ThemeColors {
    if (isLight) {
        return {
            assistantBg: "bg-black/35",
            assistantBorder: "border-black/40",
            assistantText: "text-gray-900",
            userBg: "bg-emerald-600/40",
            userBorder: "border-emerald-700/50",
            userText: "text-gray-900",

            headerOverlay: "bg-white/45 backdrop-blur-md",
            footerOverlay: "bg-white/50 backdrop-blur-md",
            contentOverlay: "rgba(255, 255, 255, 0.20)",
        };
    } else {
        return {
            assistantBg: "bg-white/20",
            assistantBorder: "border-white/25",
            assistantText: "text-white/95",
            userBg: "bg-emerald-400/35",
            userBorder: "border-emerald-400/50",
            userText: "text-white",

            headerOverlay: "bg-[#050505]/40 backdrop-blur-md",
            footerOverlay: "bg-[#050505]/45 backdrop-blur-md",
            contentOverlay: "rgba(5, 5, 5, 0.15)",
        };
    }
}
