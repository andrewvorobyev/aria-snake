
import * as THREE from 'three';

export class TextureGenerator {
    /**
     * Generates a seamless noise texture for polar mapping or general use.
     * Uses a simple accumulation of sine waves (approximate Perlin) to ensure wrapping on X axis if needed,
     * or just standard noise.
     */
    public static generateNoiseTexture(width: number, height: number): THREE.DataTexture {
        const size = width * height;
        const data = new Float32Array(size * 4);

        for (let i = 0; i < size; i++) {
            const stride = i * 4;
            const x = i % width;
            const y = Math.floor(i / width);

            // Normalize
            const nx = x / width;
            const ny = y / height;

            // Generate noise
            // We want it to be seamless on X (for polar mapping 0..1 wrapping)
            const noise = this.seamlessNoise(nx, ny, 4.0);

            // Map -1..1 to 0..1
            const val = noise * 0.5 + 0.5;

            data[stride] = val;     // R: Primary Noise
            data[stride + 1] = this.seamlessNoise(nx, ny, 10.0) * 0.5 + 0.5; // G: High frequency
            data[stride + 2] = Math.random(); // B: White noise
            data[stride + 3] = 1.0; // A
        }

        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }

    private static seamlessNoise(u: number, v: number, scale: number): number {
        // To make X seamless, we map u (0..1) to a circle in 2D noise space? 
        // Or just mix 2 samples.
        // Let's use simple multi-octave sin/cos for "procedural" look without heavy simplex impl

        // Wrap X: Map u to angle
        // const angle = u * Math.PI * 2;
        // Cylinder projection:
        // x = cos(angle), z = sin(angle)
        // y = v
        // We need 3D noise... 

        // Let's just do a linear mix for X wrapping
        // return mix(noise(u, v), noise(u+1, v), u?) No.

        // Simpler: Just overlay sin waves that align with integer periods

        let val = 0;
        let amp = 0.5;
        let freq = scale;

        for (let i = 0; i < 4; i++) {
            // Ensure integer frequency in X for wrapping?
            // If sin(x * freq * 2PI) -> wraps perfectly.

            // X Component (Seamless)
            const nX = Math.sin(u * Math.PI * 2 * Math.floor(freq) + i);
            const nY = Math.sin(v * freq * 3.14 + i * 1.3);

            val += nX * nY * amp;

            amp *= 0.5;
            freq *= 2.0;
        }

        return val;
    }
}
