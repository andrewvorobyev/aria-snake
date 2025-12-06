import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

export interface RGB { r: number; g: number; b: number; }

const BLACK: RGB = { r: 0, g: 0, b: 0 };
const WHITE: RGB = { r: 255, g: 255, b: 255 };

export async function extractAlphaTwoPass(
    imgOnWhitePath: string,
    imgOnBlackPath: string,
    outputPath: string
): Promise<void> {
    const img1 = sharp(imgOnWhitePath);
    const img2 = sharp(imgOnBlackPath);

    // Ensure we are working with raw pixel data
    const { data: dataWhite, info: meta } = await img1
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    const { data: dataBlack } = await img2
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    if (dataWhite.length !== dataBlack.length) {
        throw new Error("Dimension mismatch: Images must be identical size");
    }

    const outputBuffer = Buffer.alloc(dataWhite.length);

    // Distance between White (255,255,255) and Black (0,0,0)
    // sqrt(255^2 + 255^2 + 255^2) ≈ 441.67
    const bgDist = Math.sqrt(3 * 255 * 255);

    for (let i = 0; i < meta.width * meta.height; i++) {
        const offset = i * 4;

        // Get RGB values for the same pixel in both images
        const rW = dataWhite[offset];
        const gW = dataWhite[offset + 1];
        const bW = dataWhite[offset + 2];

        const rB = dataBlack[offset];
        const gB = dataBlack[offset + 1];
        const bB = dataBlack[offset + 2];

        // Calculate the distance between the two observed pixels
        const pixelDist = Math.sqrt(
            Math.pow(rW - rB, 2) +
            Math.pow(gW - gB, 2) +
            Math.pow(bW - bB, 2)
        );

        // THE FORMULA:
        // If the pixel is 100% opaque, it looks the same on Black and White (pixelDist = 0).
        // If the pixel is 100% transparent, it looks exactly like the backgrounds (pixelDist = bgDist).
        // Therefore:
        let alpha = 1 - (pixelDist / bgDist);

        // Clamp results to 0-1 range
        alpha = Math.max(0, Math.min(1, alpha));

        // Color Recovery:
        // We use the image on black to recover the color, dividing by alpha 
        // to un-premultiply it (brighten the semi-transparent pixels)
        let rOut = 0, gOut = 0, bOut = 0;

        if (alpha > 0.01) {
            // Recover foreground color from the version on black
            // (C - (1-alpha) * BG) / alpha
            // Since BG is black (0,0,0), this simplifies to C / alpha
            rOut = rB / alpha;
            gOut = gB / alpha;
            bOut = bB / alpha;
        }

        outputBuffer[offset] = Math.round(Math.min(255, rOut));
        outputBuffer[offset + 1] = Math.round(Math.min(255, gOut));
        outputBuffer[offset + 2] = Math.round(Math.min(255, bOut));
        outputBuffer[offset + 3] = Math.round(alpha * 255);
    }

    await sharp(outputBuffer, {
        raw: { width: meta.width, height: meta.height, channels: 4 }
    })
        .png()
        .toFile(outputPath);
}

// Minimal runner
(async () => {
    // Look for matching files in assets/raw that end with _black.jpg/png and _white.jpg/png
    const rawDir = path.resolve(process.cwd(), 'assets/raw');
    const outDir = path.resolve(process.cwd(), 'assets/ready');

    // Ensure output dir exists
    try {
        await fs.mkdir(outDir, { recursive: true });
    } catch { }

    try {
        const files = await fs.readdir(rawDir);
        // Find pairs (e.g. apple_black.jpg, apple_white.jpg)
        // Group by base name
        const bases = new Set<string>();
        files.forEach(f => {
            if (f.includes('_black.')) bases.add(f.split('_black.')[0]);
            if (f.includes('_white.')) bases.add(f.split('_white.')[0]);
        });

        for (const base of bases) {
            console.log(`Processing ${base}...`);
            // Attempt extensions
            const blackName = files.find(f => f.startsWith(base + '_black.'));
            const whiteName = files.find(f => f.startsWith(base + '_white.'));

            if (blackName && whiteName) {
                const pBlack = path.join(rawDir, blackName);
                const pWhite = path.join(rawDir, whiteName);
                const pOut = path.join(outDir, base + '.png');

                await extractAlphaTwoPass(pWhite, pBlack, pOut);
                console.log(`Saved ${pOut}`);
            } else {
                console.warn(`Skipping ${base}: missing pair (Black: ${blackName}, White: ${whiteName})`);
            }
        }
    } catch (e) {
        console.error("Error processing:", e);
    }
})();
