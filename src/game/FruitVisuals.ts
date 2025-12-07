import * as THREE from 'three';
import { CONFIG } from '../constants';

export const FruitType = {
    BROCCOLI_A: 0,
    BROCCOLI_B: 1
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
uniform float uSeed;

// --- Noise Functions ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m * m * m;
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

// Voronoi for floret bumps
float voronoi(vec2 p) {
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    float m_dist = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = i_st + neighbor;
            float rx = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
            float ry = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453);
            vec2 point = vec2(rx, ry);
            vec2 diff = neighbor + point - f_st;
            m_dist = min(m_dist, dot(diff, diff));
        }
    }
    return sqrt(m_dist);
}

void main() {
    float t = uTime + uSeed;
    vec2 p = vUv * 2.0 - 1.0;
    
    // === DISTORTION & PULSING ===
    // Organic wobble distortion
    float distort1 = snoise(p * 3.0 + t * 0.8) * 0.08;
    float distort2 = snoise(p * 5.0 - t * 0.6 + uSeed) * 0.05;
    p += vec2(distort1, distort2);
    
    // Breathing pulse (affects whole shape)
    float breathe = sin(t * 2.5) * 0.05 + sin(t * 1.3 + uSeed) * 0.03;
    
    float len = length(p);
    float angle = atan(p.y, p.x);
    
    // === BROCCOLI SHAPE ===
    
    // Stem at bottom (narrow section)
    float stemWidth = 0.15;
    float stemHeight = 0.25;
    bool inStem = p.y < -0.3 && abs(p.x) < stemWidth;
    
    // Crown shape - bumpy circular top
    // Offset p upward so crown is centered above stem
    vec2 crownP = p - vec2(0.0, 0.1);
    float crownLen = length(crownP);
    
    // Base crown radius with breathing pulse
    float crownR = 0.45 + breathe;
    
    // Add bumpy floret edges using animated noise
    float bumpAngle = atan(crownP.y, crownP.x);
    float bumps = snoise(vec2(bumpAngle * 3.0 + uSeed, crownLen * 4.0 + t * 0.3)) * 0.12;
    bumps += snoise(vec2(bumpAngle * 6.0 + uSeed * 2.0, crownLen * 8.0 - t * 0.2)) * 0.06;
    crownR += bumps;
    
    // Slightly flatten bottom of crown where it meets stem
    float flattenFactor = smoothstep(-0.4, -0.1, crownP.y);
    crownR *= mix(0.7, 1.0, flattenFactor);
    
    // Pulsing wobble animation
    float wobble = sin(t * 3.0 + crownLen * 8.0) * 0.03;
    wobble += sin(t * 1.7 + bumpAngle * 2.0) * 0.02;
    crownR += wobble;
    
    // Distance field
    float crownDist = crownLen - crownR;
    
    // Stem shape
    float stemDist = 1.0;
    if (p.y < -0.2) {
        float stemTop = -0.2;
        float stemBot = -0.55;
        float yNorm = (p.y - stemTop) / (stemBot - stemTop);
        float stemTaper = stemWidth * (1.0 - yNorm * 0.4); // Taper at bottom
        stemDist = abs(p.x) - stemTaper;
        stemDist = max(stemDist, -(p.y - stemBot)); // Bottom cap
        stemDist = max(stemDist, p.y - stemTop); // Top cap (connects to crown)
    }
    
    // Combine crown and stem
    float dist = min(crownDist, stemDist);
    
    // Soft edge
    float alpha = 1.0 - smoothstep(-0.02, 0.08, dist);
    if (alpha <= 0.01) discard;
    
    // === COLORING ===
    // Dark green base
    vec3 darkGreen = vec3(0.15, 0.35, 0.12);
    vec3 midGreen = vec3(0.25, 0.55, 0.18);
    vec3 lightGreen = vec3(0.4, 0.7, 0.25);
    vec3 stemColor = vec3(0.35, 0.5, 0.2);
    
    // Tint with uColor for variety
    darkGreen = mix(darkGreen, uColor * 0.3, 0.3);
    midGreen = mix(midGreen, uColor * 0.5, 0.3);
    lightGreen = mix(lightGreen, uColor * 0.7, 0.2);
    
    vec3 col;
    
    if (crownDist < stemDist) {
        // Crown coloring
        
        // Voronoi floret bumps
        float florets = voronoi(crownP * 12.0 + uSeed);
        float floretBump = 1.0 - smoothstep(0.0, 0.4, florets);
        
        // Base gradient from center to edge
        float edgeFactor = crownLen / crownR;
        col = mix(lightGreen, midGreen, edgeFactor);
        
        // Add floret highlights
        col = mix(col, lightGreen * 1.2, floretBump * 0.4);
        
        // Darker in crevices between florets
        col = mix(col, darkGreen, smoothstep(0.3, 0.5, florets) * 0.3);
        
        // Subtle noise variation
        float texNoise = snoise(crownP * 15.0 + uSeed);
        col += texNoise * 0.03;
        
        // Rim darkening
        col *= 1.0 - smoothstep(0.7, 1.0, edgeFactor) * 0.3;
        
    } else {
        // Stem coloring
        col = stemColor;
        
        // Vertical streaks on stem
        float streaks = snoise(vec2(p.x * 20.0, p.y * 5.0 + uSeed));
        col += vec3(0.02, 0.04, 0.01) * streaks;
        
        // Slightly lighter at edges
        float stemEdge = abs(p.x) / stemWidth;
        col = mix(col, col * 0.8, stemEdge * 0.3);
    }
    
    // Subtle pulsing glow
    float pulse = sin(t * 3.0) * 0.5 + 0.5;
    col += vec3(0.02, 0.04, 0.01) * pulse;
    
    gl_FragColor = vec4(col, alpha);
}
`;

import { TextureGenerator } from '../utils/TextureGenerator';

export class FruitVisuals {
    public static createFruitMesh(type: number): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(2.0, 2.0);
        geometry.rotateX(-Math.PI / 2);

        // Green color variations for broccoli
        let color: THREE.Color;
        switch (type) {
            case FruitType.BROCCOLI_A:
                color = new THREE.Color(0.3, 0.6, 0.2); // Classic green
                break;
            case FruitType.BROCCOLI_B:
                color = new THREE.Color(0.25, 0.7, 0.3); // Slightly brighter
                break;
            default:
                color = new THREE.Color(0.3, 0.55, 0.2);
        }

        const seed = Math.random() * 100.0;

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
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
