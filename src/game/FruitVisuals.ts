import * as THREE from 'three';
import { CONFIG } from '../constants';

export enum FruitType {
    APPLE = 0,
    BANANA = 1,
    BLUEBERRY = 2,
    RASPBERRY = 3
}

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
varying vec3 vWorldPosition;

uniform int uType;
uniform float uTime;
uniform vec3 uColor;

// --- 2D SDF Primitives ---

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

// Crescent / Moon shape for Banana
float sdMoon(vec2 p, float d, float ra, float rb) {
    p.y = abs(p.y);
    float a = (ra*ra - rb*rb + d*d)/(2.0*d);
    float b = sqrt(max(ra*ra-a*a,0.0));
    if(d*(p.x*b-p.y*a) > d*d*max(b-p.y,0.0))
        return length(p-vec2(a,b));
    return max( (length(p)-ra),
               -(length(p-vec2(d,0.0))-rb));
}

// Noise for texture
float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float snoise(vec2 v) {
    return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); // Cheap noise
}

// Voronoi for Raspberry
float voronoi(vec2 uv) {
    vec2 p = floor(uv);
    vec2 f = fract(uv);
    float res = 8.0;
    for(int j=-1; j<=1; j++)
    for(int i=-1; i<=1; i++) {
        vec2 b = vec2(i, j);
        vec2 r = vec2(b) - f + rand(p + b);
        float d = dot(r, r);
        res = min(res, d);
    }
    return sqrt(res);
}

void main() {
    // 2D UV Space (-1 to 1)
    vec2 p = vUv * 2.0 - 1.0;
    
    // Animation: Bobbing
    p.y += 0.03 * sin(uTime * 2.0 + p.x); 
    
    // Animation: Pulsing Size
    float pulse = 0.02 * sin(uTime * 3.0);
    
    float d = 1.0; // Distance field to shape
    vec3 col = uColor * 1.3; // Brighten base color
    float border = 0.0;
    
    // --- SHAPE LOGIC ---
    
    if (uType == 0) { // APPLE
        // Circle distorted into Heart/Apple shape
        // Flatten bottom, dent top
        float angle = atan(p.x, -p.y); // 0 at bottom
        float r = 0.45;
        r += 0.05 * cos(angle); // Wider bottom
        r -= 0.1 * smoothstep(0.5, 1.0, abs(p.y)) * step(0.0, p.y); // Top dent
        
        d = length(p) - r;
        
        // Leaf
        vec2 lp = p - vec2(0.1, 0.5);
        lp = mat2(0.8, -0.6, 0.6, 0.8) * lp;
        float leaf = length(lp) - 0.15;
        leaf = max(leaf, abs(lp.x) - 0.05); // Thin
        if (leaf < 0.0) {
            d = min(d, leaf); // Combine with apple shape
            col = mix(col, vec3(0.4, 0.9, 0.4), step(leaf, d)); // Bright Green leaf
        }
        
    } else if (uType == 1) { // BANANA
        // Crescent
        // Transform p to align
        vec2 bp = p;
        bp = mat2(0.7, 0.7, -0.7, 0.7) * bp; // Rotate
        bp += vec2(0.1, 0.0);
        d = sdMoon(bp, 0.4, 0.6, 0.5); 
        
        // Brown spots
        if (d < 0.0) {
            if (rand(p * 5.0) > 0.95) col = vec3(0.5, 0.4, 0.1);
        }
        
    } else if (uType == 2) { // BLUEBERRY
        // Circle
        d = sdCircle(p, 0.42);
        
        // Crown (Star)
        // Center hole
        float r = length(p);
        if (d < 0.0) {
            // Darker center
            if (r < 0.15) {
                // Star shape
                float angle = atan(p.y, p.x);
                float star = 0.1 + 0.05 * cos(angle * 5.0);
                if (r < star) col *= 0.4; // Deep hole (brighter)
                else col *= 0.9; // Rim of hole (brighter)
            }
            // Matte finish noise
            col += (rand(p * 20.0) - 0.5) * 0.1;
        }
        
    } else if (uType == 3) { // RASPBERRY
        // Circle base
        d = sdCircle(p, 0.45);
        
        if (d < 0.0) {
            // Cell pattern (Voronoi)
            float cells = voronoi(p * 5.0); // Scale up
            // Highlight centers of cells (Drupelets)
            float drupe = smoothstep(0.0, 0.5, cells);
            
            // Shading
            vec3 dark = uColor * 0.6;
            vec3 light = uColor * 1.4;
            col = mix(dark, light, drupe);
            
            // Bump the distance field for border?
            border = drupe * 0.05;
        }
    }
    
    // Apply Pulse
    d -= pulse;
    
    // --- RENDERING ---
    
    // Antialiased Cutout
    float alpha = 1.0 - smoothstep(0.0, 0.02, d + border);
    if (alpha <= 0.0) discard;
    
    // Internal Glow / Rim
    // Approx normal from center
    float r = length(p);
    
    // Gradient shading (Fake 3D)
    vec3 lightDir = normalize(vec3(0.5, 1.0, 1.0));
    // Normal estimation for 2D blob (Hemisphere)
    vec3 N = normalize(vec3(p, sqrt(max(0.0, 0.25 - dot(p,p))))); // Very flat normal
    float diff = max(0.0, dot(N, lightDir));
    
    vec3 finalColor = col * (0.8 + 0.4 * diff);
    
    // Distinct Edge Outline
    float outline = smoothstep(-0.02, 0.0, d - pulse); // Inside edge
    finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), (1.0 - outline) * 0.5); // Whitish rim?
    
    // Darker outline at very edge?
    float darkEdge = smoothstep(-0.05, 0.0, d - pulse);
    finalColor *= (0.5 + 0.5 * (1.0 - darkEdge)); // Darken edge

    gl_FragColor = vec4(finalColor, alpha);
}
`;

export class FruitVisuals {
    public static createFruitMesh(type: FruitType): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

        let color: THREE.Color;
        let scale = 1.3; // Uniform Large Size

        switch (type) {
            case FruitType.APPLE:
                color = new THREE.Color(0xff6666); // Brighter Red
                break;
            case FruitType.BANANA:
                color = new THREE.Color(0xffff66); // Brighter Yellow
                break;
            case FruitType.BLUEBERRY:
                color = new THREE.Color(0x6699ff); // Brighter Blue
                break;
            case FruitType.RASPBERRY:
                color = new THREE.Color(0xff3388); // Brighter Pink
                break;
            default:
                color = new THREE.Color(0xffffff);
        }

        const material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uType: { value: type },
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(color.r, color.g, color.b) }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false // Don't block background
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.multiplyScalar(scale);

        // Lift slightly to avoid z-fight with floor
        mesh.position.y = 0.05;

        return mesh;
    }
}
