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
    // Look for matching files in assets/raw that end with -black.jpg/png and -white.jpg/png
    const rawDir = path.resolve(process.cwd(), 'assets/raw');
    const outDir = path.resolve(process.cwd(), 'assets/ready');

    // Ensure output dir exists
    try {
        await fs.mkdir(outDir, { recursive: true });
    } catch { }

    try {
        // Filter out hidden files like .DS_Store
        const files = (await fs.readdir(rawDir)).filter(f => !f.startsWith('.'));

        const pairs = new Map<string, { black?: string; white?: string }>();

        // 1. Scan and Validate Filenames
        for (const f of files) {
            const ext = path.extname(f);
            // Supported extensions check? assume valid images for now.
            const name = path.basename(f, ext); // e.g. "kiwi-black"

            let base = "";
            let type = "";

            if (name.endsWith('-black')) {
                base = name.substring(0, name.length - '-black'.length);
                type = 'black';
            } else if (name.endsWith('-white')) {
                base = name.substring(0, name.length - '-white'.length);
                type = 'white';
            } else {
                // Strict assertion fail
                throw new Error(`File '${f}' does not match expected pattern '*-black${ext}' or '*-white${ext}'`);
            }

            if (!pairs.has(base)) {
                pairs.set(base, {});
            }
            const entry = pairs.get(base)!;
            if (type === 'black') entry.black = f;
            else entry.white = f;
        }

        // 2. Process Pairs
        for (const [base, pair] of pairs) {
            if (!pair.black || !pair.white) {
                throw new Error(`Missing pair for '${base}': Found black='${pair.black}', white='${pair.white}'`);
            }

            console.log(`Processing ${base}...`);
            const pBlack = path.join(rawDir, pair.black);
            const pWhite = path.join(rawDir, pair.white);
            const pOut = path.join(outDir, base + '.png');

            await extractAlphaTwoPass(pWhite, pBlack, pOut);
            console.log(`Saved ${pOut}`);
        }
        console.log("Success.");

    } catch (e) {
        console.error("Error processing:", e);
        process.exit(1);
    }
})();
