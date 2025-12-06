import * as THREE from 'three';
import { CONFIG } from '../constants';

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
uniform sampler2D uNoiseMap;
uniform float uSeed;
uniform float uArmCount; // Number of virus arms
uniform float uArmLength; // Max length of arms

// --- Noise Function ---
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
    float t = uTime + uSeed;
    vec2 p = vUv * 2.0 - 1.0;
    
    // --- 1. WOBBLE & DISTORTION ---
    // Wobble the whole shape
    float wobble = snoise(p + t * 0.5) * 0.1;
    vec2 wobbledP = p + wobble;

    float len = length(wobbledP);
    float angle = atan(wobbledP.y, wobbledP.x);
    
    // --- 2. VIRUS ARMS ---
    // Make angle uneven for asymmetry
    // Sample noise based on polar coords to ensure continuity wrapping around
    float angleNoise = snoise(vec2(cos(angle), sin(angle)) + t * 0.2);
    
    // Distort the angle slightly so arms aren't perfectly spaced
    float distortedAngle = angle + angleNoise * 0.5;
    
    // Arm Modulation
    float armMod = cos(distortedAngle * floor(uArmCount)); 
    
    // Normalize and sharpen
    armMod = armMod * 0.5 + 0.5;
    armMod = pow(armMod, 3.0);
    
    // Irregular Arm Lengths
    // Some arms longer than others based on angle
    float lengthVar = 0.8 + 0.4 * angleNoise; 
    
    // Pulse Arms
    float pulse = sin(t * 2.0 + uSeed); 
    float currentArmLen = uArmLength * (0.5 + 0.5 * pulse) * lengthVar;
    
    // Base Body Radius
    float r = 0.35; 
    
    // Add Arms
    r += armMod * currentArmLen;
    
    // --- 3. SURFACE NOISE ---
    float noise = snoise(p * 8.0 + t);
    r += noise * 0.05; // Rough surface
    
    // Distance Field
    float dist = len - r;
    
    // Soft Dissolve Edge
    float edgeFuzz = snoise(p * 20.0 + t * 2.0) * 0.1;
    float alpha = 1.0 - smoothstep(0.0, 0.15 + edgeFuzz, dist);
    
    if (alpha <= 0.01) discard;
    
    // --- 4. COLORING ---
    // Core glow vs Body
    float coreDist = len / r;
    vec3 baseCol = uColor * 0.7;
    vec3 glowCol = uColor * 1.5;
    
    // Radial gradient
    vec3 col = mix(glowCol, baseCol, smoothstep(0.0, 0.8, coreDist));
    
    // Veins/Texture on top
    float texNoise = texture2D(uNoiseMap, vUv + t * 0.05).r;
    col += (texNoise - 0.5) * 0.2;
    
    // Darken Edge rim
    col *= (1.0 - smoothstep(0.8, 1.0, coreDist) * 0.5);

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

        const geometry = new THREE.PlaneGeometry(1.8, 1.8); // Slightly larger for arms
        geometry.rotateX(-Math.PI / 2);

        let color: THREE.Color;

        switch (type) {
            case FruitType.PARTICLE_A:
                color = new THREE.Color(0xff2244); // Crimson Red
                break;
            case FruitType.PARTICLE_B:
                color = new THREE.Color(0xff4422); // Tomato Red
                break;
            default:
                color = new THREE.Color(0xff3333);
        }

        // Random Seed for Async animation & Arm Config
        const seed = Math.random() * 100.0;

        // Arm Configuration
        const conf = CONFIG.FRUIT.VIRUS;
        const armsMin = conf.ARMS.MIN;
        const armsMax = conf.ARMS.MAX;
        const armCount = Math.floor(armsMin + Math.random() * (armsMax - armsMin + 1));

        const lenMin = conf.ARM_LENGTH.MIN;
        const lenMax = conf.ARM_LENGTH.MAX;
        const armLength = lenMin + Math.random() * (lenMax - lenMin);

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
                uNoiseMap: { value: this.noiseTexture },
                uSeed: { value: seed },
                uArmCount: { value: armCount },
                uArmLength: { value: armLength }
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
