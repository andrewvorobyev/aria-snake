import * as THREE from 'three';

export const FruitType = {
    PARTICLE_A: 0, // Was Kiwi
    PARTICLE_B: 1  // Was Strawberry
} as const;
export type FruitType = typeof FruitType[keyof typeof FruitType];

const VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;
void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const FRAGMENT_SHADER = `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform float uSpikeFreq;
uniform float uSpikeAmp;
uniform sampler2D uNoiseMap; // Procedural Noise
uniform float uSeed;

// --- Noise Function (Keep for fine detail) ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

void main() {
    // Unique Time
    float t = uTime + uSeed;
    
    vec2 p = vUv * 2.0 - 1.0;
    
    // --- 1. DOMAIN WARPING (Fluid distortion) ---
    // Warps the coordinate space so the shape isn't perfectly circular/radial
    float warpNoise = snoise(p * 1.5 + t * 0.2);
    vec2 warpedP = p + vec2(warpNoise * 0.15); // Significant warp
    
    float len = length(warpedP);
    float angle = atan(warpedP.y, warpedP.x);
    
    float angUV = (angle / 6.2831) + 0.5;
    
    // --- 2. SPIKES & SHAPE ---
    vec4 noiseVal = texture2D(uNoiseMap, vec2(angUV, t * 0.1));
    float n1 = noiseVal.r;
    float n2 = noiseVal.g; // High freq
    
    // Less geometric, more organic frequency
    float dynamicFreq = uSpikeFreq + (n1 - 0.5) * 6.0; 
    float dynamicAmp = uSpikeAmp * (0.6 + 0.6 * n2);
    
    float wave = sin(angle * dynamicFreq + t * 2.0 + n1 * 10.0); 
    
    // Softer spikes (Organic/Fleshy) - reduced power
    float sharpness = 0.8 + 2.0 * n2; 
    float spikeShape = pow(abs(wave), sharpness);
    
    // Irregular Breathing
    float breathe = 0.7 + 0.15 * sin(t * 2.5 + n1 * 5.0);
    
    // Base Radius with Spikes
    float r = breathe + spikeShape * dynamicAmp;
    
    // "Tumor" bubbling (Low freq distortion)
    r += (n1 - 0.5) * 0.3 * sin(t * 3.0);
    
    // --- 3. MEDIUM FREQUENCY NOISE (Fluffy/Cloudy like Organisms) ---
    // Match the "blob" aesthetic (freq ~12.0)
    float fineNoise = snoise(p * 12.0 + t * 3.0); 
    r += fineNoise * 0.15; // Significant fluff
    
    // Distance Field
    float dist = len - r * 0.45; 
    
    // Soft Dissolve Edge
    float edgeNoise = snoise(p * 40.0); // Medium freq edge breakup
    float alpha = 1.0 - smoothstep(0.0, 0.25 + 0.1 * edgeNoise, dist);
    
    if (alpha <= 0.01) discard;
    
    // --- 4. COLORING ---
    // Distorted Core
    float coreDist = len / (r * 0.45);
    float coreNoise = snoise(p * 4.0 + t);
    float core = 1.0 - smoothstep(0.0, 0.7 + 0.3 * coreNoise, coreDist);
    
    // Pulse
    float pulse = 0.3 * sin(t * 8.0) * noiseVal.b;
    
    vec3 baseCol = uColor * 0.6; // Not too dark
    vec3 glowCol = uColor * (1.6 + pulse);
    
    // Mix
    vec3 col = mix(baseCol, glowCol, core);
    
    // Grain Overlay (Subtle)
    float grain = fract(sin(dot(vUv.xy + t, vec2(12.9898, 78.233))) * 43758.5453);
    col += (grain - 0.5) * 0.1;
    
    // Deep Ao
    float crevice = smoothstep(-0.8, 0.8, fineNoise);
    col *= (0.85 + 0.15 * crevice);

    gl_FragColor = vec4(col, alpha);
}
`;

import { TextureGenerator } from '../utils/TextureGenerator';

export class FruitVisuals {
    private static noiseTexture: THREE.Texture;

    public static createFruitMesh(type: number): THREE.Mesh {
        if (!this.noiseTexture) {
            this.noiseTexture = TextureGenerator.generateNoiseTexture(256, 256);
        }

        const geometry = new THREE.PlaneGeometry(1.5, 1.5);
        geometry.rotateX(-Math.PI / 2);

        let color: THREE.Color;
        let spikeFreq = 8.0;
        let spikeAmp = 0.3;

        switch (type) {
            case FruitType.PARTICLE_A:
                color = new THREE.Color(0x44ccff); // Light Blue
                spikeFreq = 4.0;
                spikeAmp = 0.45;
                break;
            case FruitType.PARTICLE_B:
                color = new THREE.Color(0xffcc44); // Golden Yellow
                spikeFreq = 7.0;
                spikeAmp = 0.35;
                break;
            default:
                color = new THREE.Color(0xffffff);
        }

        // Random Seed for Async animation
        const seed = Math.random() * 100.0;

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
                uSpikeFreq: { value: spikeFreq },
                uSpikeAmp: { value: spikeAmp },
                uNoiseMap: { value: this.noiseTexture },
                uSeed: { value: seed }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.1;

        return mesh;
    }
}
