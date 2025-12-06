import * as THREE from 'three';
import { CONFIG } from '../constants';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
uniform vec2 uResolution;
uniform vec3 uVignetteParams; // x: start, y: end, z: darkness
varying vec2 vUv;

// --- NOISE FUNCTIONS ---

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

// Simplex noise
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
                        -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
        + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
    vec3 g;
    g.x  = a0.x * x0.x  + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Fractal Brownian Motion
float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 0.0;
    // Layering noise
    for (int i = 0; i < 4; i++) {
        value += amplitude * snoise(st);
        st *= 2.0;
        amplitude *= 0.5;
    }
    return value;
}

// Voronoi / Cellular noise
vec2 random2(vec2 p) {
    return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453);
}

float cellular(vec2 p, out vec2 point) {
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    float m_dist = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 pt = random2(i_st + neighbor);
            // Animate
            pt = 0.5 + 0.5 * sin(uTime * 0.1 + 6.2831 * pt);
            vec2 diff = neighbor + pt - f_st;
            float dist = length(diff);
            if (dist < m_dist) {
                m_dist = dist;
                point = pt;
            }
        }
    }
    return m_dist;
}

void main() {
    // 1. Normalized Coordinates & Microscope Distortion
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    
    // Lens distortion (barrel)
    float r2 = dot(centered, centered);
    vec2 distortedUV = uv + centered * (r2 * 0.05); // Subtle edge warping

    // 2. Base "Agar" Layer (Fluid background)
    // washed out yellow-green: (0.9, 0.95, 0.7)
    // variations in density
    float density = fbm(distortedUV * 3.0 + uTime * 0.05);
    vec3 colorBase = vec3(0.85, 0.92, 0.70); // Pale yellow-green
    vec3 colorDense = vec3(0.75, 0.85, 0.60); // Slightly darker
    
    vec3 agar = mix(colorBase, colorDense, smoothstep(-0.5, 0.8, density));

    // 3. Cellular Structure (Microbes/Cells)
    vec2 cellPoint;
    float cellDist = cellular(distortedUV * 5.0, cellPoint);
    
    // In bright field microscopy, cells are often transparent but have dark edges due to refraction
    // and sometimes a bright center.
    float cellWall = smoothstep(0.48, 0.52, cellDist); // cell edge
    float cellInner = smoothstep(0.0, 0.45, cellDist);
    
    // Create "Cell" look
    // Darker rim (refraction)
    vec3 cellColor = vec3(0.5, 0.6, 0.4); 
    float edgeFactor = 1.0 - smoothstep(0.40, 0.50, cellDist);
    float coreFactor = 1.0 - smoothstep(0.0, 0.15, cellDist * 1.5 + snoise(uv*20.0)*0.2); // Nucleus

    // Apply cells to agar
    // If inside cell radius (approx 0.5 grid space)
    if (cellDist < 0.5) {
        // Refraction outline
        agar = mix(agar, vec3(0.4, 0.5, 0.3), smoothstep(0.4, 0.5, cellDist) * 0.5);
        // Cell body (slight tint)
        agar = mix(agar, vec3(0.95, 0.98, 0.9), smoothstep(0.1, 0.5, cellDist) * 0.2);
        // Nucleus
        agar = mix(agar, vec3(0.3, 0.4, 0.2), coreFactor * 0.4);
    }

    // 4. Floating Particulates / Dust (High freq noise)
    float dust = snoise(uv * 30.0 + uTime * 0.02);
    if (dust > 0.7) {
        agar *= 0.9; // Dark specks
    }
    
    // Microscope Vignette
    vec2 p = vUv * 2.0 - 1.0;
    float dist = length(p);
    // Start fading at 0.8, reach max fade at 1.5
    float vignette = smoothstep(uVignetteParams.x, uVignetteParams.y, dist); 
    
    // Dim to % brightness at edges
    vec3 finalColor = mix(agar, agar * uVignetteParams.z, vignette);
    
    // Add "glow" or ambient light
    finalColor += vec3(0.05, 0.05, 0.02);

    gl_FragColor = vec4(finalColor, 1.0);
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
                uResolution: { value: new THREE.Vector2(1, 1) },
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
}
