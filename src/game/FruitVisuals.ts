import * as THREE from 'three';

export const FruitType = {
    APPLE: 0,
    BANANA: 1,
    BLUEBERRY: 2,
    RASPBERRY: 3
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
varying vec3 vWorldPosition;

uniform int uType;
uniform float uTime;
uniform vec3 uColor;

// --- Noise ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
    m = m*m ;
    m = m*m ;
    vec3 x = 2.0 * fract(p * C.www) - 1.0;
    vec3 h = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;
    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
    vec3 g;
    g.x  = a0.x  * x0.x  + h.x  * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// --- Shapes ---

float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdMoon(vec2 p, float d, float ra, float rb) {
    p.y = abs(p.y);
    float a = (ra*ra - rb*rb + d*d)/(2.0*d);
    float b = sqrt(max(ra*ra-a*a,0.0));
    if(d*(p.x*b-p.y*a) > d*d*max(b-p.y,0.0))
        return length(p-vec2(a,b));
    return max( (length(p)-ra),
               -(length(p-vec2(d,0.0))-rb));
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    
    // Scale down p slightly to fit shapes
    p *= 1.1;

    float d = 1.0;
    float noiseScale = 3.0;
    float noiseTime = uTime * 0.5;
    
    // Intense Color Base
    vec3 colorBase = uColor;

    if (uType == 0) { // APPLE
        float angle = atan(p.x, -p.y);
        float r = 0.4;
        r += 0.08 * cos(angle); 
        r -= 0.15 * smoothstep(0.5, 1.0, abs(p.y)) * step(0.0, p.y);
        d = length(p) - r;
        
        // Leaf
        vec2 lp = p - vec2(0.1, 0.55);
        lp = mat2(0.8, -0.6, 0.6, 0.8) * lp;
        float leaf = length(lp) - 0.15;
        leaf = max(leaf, abs(lp.x) - 0.02);
        
        // Combine leaf (union)
        // Fuzzy blend?
        float k = 0.1;
        float h = clamp( 0.5 + 0.5*(leaf-d)/k, 0.0, 1.0 );
        d = mix( leaf, d, h ) - k*h*(1.0-h);
        
        // Leaf makes it green?
        if (leaf < d + 0.05) {
             // Mix green into base
             // But we want intense fuzzy uniform color mostly? 
             // Let's keep it monochromatic intense for simplicity or subtle mix.
             colorBase = mix(colorBase, vec3(0.2, 1.0, 0.2), 0.3);
        }

    } else if (uType == 1) { // BANANA
        vec2 bp = p;
        bp = mat2(0.7, 0.7, -0.7, 0.7) * bp; 
        bp += vec2(0.1, 0.0);
        d = sdMoon(bp, 0.35, 0.55, 0.45); 

    } else if (uType == 2) { // BLUEBERRY
        d = sdCircle(p, 0.4);
        // Star dent
        float angle = atan(p.y, p.x);
        float dent = 0.5 + 0.5 * sin(angle * 5.0);
        float r = length(p);
        if (r < 0.2) {
             d += 0.1 * dent * (0.2 - r) * 5.0; // Raise distance in center star
        }

    } else if (uType == 3) { // RASPBERRY
        d = length(p) - 0.45;
        // Bumpy surface
        d += 0.05 * sin(p.x * 20.0) * sin(p.y * 20.0);
    }
    
    // --- FUZZY EFFECT ---
    // Distort distance with noise
    float fuzz = snoise(p * 5.0 + uTime * 2.0) * 0.08;
    fuzz += snoise(p * 10.0 - uTime * 3.0) * 0.04;
    
    d += fuzz;
    
    // Core (White hot center)
    float core = 1.0 - smoothstep(0.0, 0.15, d + 0.05);
    
    // Glow/Shape
    float shapeParam = smoothstep(0.1, -0.1, d); // Soft edge
    
    // Outer Glow / Fuzz
    float glow = exp(-d * 3.0) * 0.5;
    
    // Compose Color
    vec3 finalColor = colorBase * 1.5; // Boost intensity
    
    // Mix Core
    finalColor = mix(finalColor, vec3(1.0, 1.0, 1.0), core * 0.8);
    
    // Apply Shape Alpha
    float alpha = shapeParam + glow;
    alpha = clamp(alpha, 0.0, 1.0);
    
    // Darken 'empty' space noise
    if (d > 0.4) alpha *= 0.0; // Cutoff far noise
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

export class FruitVisuals {
    public static createFruitMesh(type: FruitType): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

        let color: THREE.Color;
        let scale = 1.6; // Slightly larger for fuzzy bloom

        switch (type) {
            case FruitType.APPLE:
                color = new THREE.Color(0xff2222); // Deep Red base
                break;
            case FruitType.BANANA:
                color = new THREE.Color(0xffcc00); // Golden Yellow
                break;
            case FruitType.BLUEBERRY:
                color = new THREE.Color(0x0044ff); // Electric Blue
                break;
            case FruitType.RASPBERRY:
                color = new THREE.Color(0xff0066); // Hot Pink
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
            depthWrite: false, // Glowy particles don't occlude well
            blending: THREE.NormalBlending // Or Additive? Normal looks more solid fuzzy. Additive for pure energy.
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.multiplyScalar(scale);
        mesh.position.y = 0.1; // Just above ground

        return mesh;
    }
}
