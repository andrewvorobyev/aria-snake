import * as THREE from 'three';
import { CONFIG } from '../constants';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

// Animated petri dish surface with living bacteria
const FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uVignetteParams;
varying vec2 vUv;

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

float fbm(vec2 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 6; i++) {
        if (i >= octaves) break;
        value += amplitude * snoise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// Animated voronoi for living cells
float voronoiAnimated(vec2 p, float time, out vec2 cellCenter, out float cellId) {
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    float m_dist = 10.0;
    
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cell = i_st + neighbor;
            
            // Cell-specific random values
            float hash1 = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
            float hash2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 23421.631);
            float hash3 = fract(sin(dot(cell, vec2(419.2, 371.9))) * 51723.137);
            
            // Animate cell center - swimming/merging motion
            vec2 point = vec2(hash1, hash2);
            point += 0.3 * vec2(
                sin(time * (0.3 + hash3 * 0.4) + hash1 * 6.28),
                cos(time * (0.25 + hash1 * 0.35) + hash2 * 6.28)
            );
            
            vec2 diff = neighbor + point - f_st;
            float dist = length(diff);
            
            if (dist < m_dist) {
                m_dist = dist;
                cellCenter = cell + point;
                cellId = hash1;
            }
        }
    }
    return m_dist;
}

// Second order voronoi for cell edges
float voronoiEdge(vec2 p, float time) {
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    float m_dist1 = 10.0;
    float m_dist2 = 10.0;
    
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cell = i_st + neighbor;
            
            float hash1 = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
            float hash2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 23421.631);
            float hash3 = fract(sin(dot(cell, vec2(419.2, 371.9))) * 51723.137);
            
            vec2 point = vec2(hash1, hash2);
            point += 0.3 * vec2(
                sin(time * (0.3 + hash3 * 0.4) + hash1 * 6.28),
                cos(time * (0.25 + hash1 * 0.35) + hash2 * 6.28)
            );
            
            vec2 diff = neighbor + point - f_st;
            float dist = length(diff);
            
            if (dist < m_dist1) {
                m_dist2 = m_dist1;
                m_dist1 = dist;
            } else if (dist < m_dist2) {
                m_dist2 = dist;
            }
        }
    }
    return m_dist2 - m_dist1;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    float distFromCenter = length(centered);
    float t = uTime * 0.5;
    
    // === AGAR GEL BASE ===
    vec3 agarLight = vec3(0.92, 0.88, 0.70);
    vec3 agarMid = vec3(0.82, 0.76, 0.55);
    vec3 agarDark = vec3(0.68, 0.60, 0.42);
    
    // Flowing organic noise
    vec2 flowUV = uv + vec2(t * 0.02, t * 0.015);
    float agarNoise = fbm(flowUV * 4.0, 5);
    vec3 agarBase = mix(agarMid, agarLight, agarNoise * 0.5 + 0.25);
    
    // === LARGE BACTERIAL CELLS (Swimming) ===
    vec2 cellCenter1;
    float cellId1;
    float cells1 = voronoiAnimated(uv * 5.0, t, cellCenter1, cellId1);
    float cellEdge1 = voronoiEdge(uv * 5.0, t);
    
    // Cell membrane
    float membrane1 = smoothstep(0.02, 0.06, cellEdge1);
    
    // Cell interior
    float cellBody1 = 1.0 - smoothstep(0.0, 0.5, cells1);
    
    // Cell color based on ID (slight variations)
    float cellHue = 0.12 + cellId1 * 0.08;
    float cellSat = 0.15 + cellId1 * 0.1;
    vec3 cellColor1 = hsv2rgb(vec3(cellHue, cellSat, 0.88));
    
    // === SMALLER BACTERIA (Dividing/Merging) ===
    vec2 cellCenter2;
    float cellId2;
    float cells2 = voronoiAnimated(uv * 12.0 + 5.0, t * 1.3, cellCenter2, cellId2);
    float cellEdge2 = voronoiEdge(uv * 12.0 + 5.0, t * 1.3);
    
    float membrane2 = smoothstep(0.03, 0.08, cellEdge2);
    float cellBody2 = 1.0 - smoothstep(0.0, 0.4, cells2);
    
    vec3 cellColor2 = hsv2rgb(vec3(0.08 + cellId2 * 0.06, 0.12 + cellId2 * 0.08, 0.92));
    
    // === TINY PARTICLES (Diving in/out of focus) ===
    float particleNoise = snoise(uv * 30.0 + t * 0.5);
    float particles = smoothstep(0.7, 0.9, particleNoise);
    
    // Particles depth - some sharp, some blurry
    float depthNoise = snoise(uv * 15.0 + vec2(100.0, 0.0));
    float particleBlur = smoothstep(-0.5, 0.5, depthNoise);
    
    // === COMPOSE LAYERS ===
    vec3 col = agarBase;
    
    // Large cells (background layer)
    col = mix(col, cellColor1, cellBody1 * 0.25);
    col = mix(col, agarDark, (1.0 - membrane1) * 0.15); // Membrane shadows
    
    // Smaller cells (middle layer)
    col = mix(col, cellColor2, cellBody2 * 0.18);
    col = mix(col, agarDark * 0.9, (1.0 - membrane2) * 0.1);
    
    // Particles (foreground)
    col += vec3(0.06, 0.055, 0.04) * particles * (0.5 + particleBlur * 0.5);
    
    // === DEPTH OF FIELD EFFECT ===
    // Some areas slightly blurred (out of focus)
    float focusNoise = fbm(uv * 2.0 + t * 0.1, 3);
    float inFocus = smoothstep(-0.3, 0.3, focusNoise);
    
    // Slight contrast adjustment for focus
    col = mix(col * 0.95 + 0.03, col, inFocus);
    
    // === MICROSCOPE LIGHTING ===
    // Köhler illumination (even with slight center brightness)
    float lighting = 1.0 - distFromCenter * 0.15;
    col *= lighting;
    
    // Subtle chromatic aberration at edges
    float chromatic = distFromCenter * 0.02;
    col.r *= 1.0 + chromatic;
    col.b *= 1.0 - chromatic;
    
    // === CAUSTICS (Light through medium) ===
    float caustic1 = snoise(uv * 6.0 + t * 0.08);
    float caustic2 = snoise(uv * 9.0 - t * 0.06);
    float caustics = (caustic1 + caustic2) * 0.5;
    col += vec3(0.02, 0.018, 0.01) * smoothstep(-0.2, 0.5, caustics);
    
    // === FINE GRAIN ===
    float grain = snoise(uv * 100.0 + t);
    col += grain * 0.006;
    
    // === VIGNETTE ===
    float vignette = smoothstep(uVignetteParams.x, uVignetteParams.y, distFromCenter);
    col = mix(col, col * uVignetteParams.z, vignette);
    
    // Warm ambient
    col += vec3(0.01, 0.008, 0.003);
    
    gl_FragColor = vec4(col, 1.0);
}
`;

export class Background {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;

    constructor() {
        const geometry = new THREE.PlaneGeometry(2, 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uVignetteParams: {
                    value: new THREE.Vector3(
                        CONFIG.VIGNETTE.RADIUS_START,
                        CONFIG.VIGNETTE.RADIUS_END,
                        CONFIG.VIGNETTE.DARKNESS
                    )
                }
            },
            depthWrite: false,
            depthTest: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -1;
    }

    public update(dt: number) {
        this.material.uniforms.uTime.value += dt;
    }

    public renderTrails(
        _renderer: THREE.WebGLRenderer,
        _snakePath: THREE.Vector3[],
        _organismPositions: { x: number, z: number, radius: number }[],
        _worldBounds: { width: number, depth: number }
    ) {
        // No-op: trails removed
    }

    public dispose() {
        this.material.dispose();
    }
}
