import * as THREE from 'three';

export const OBSTACLE_FRAGMENT_SHADER = `
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor;
uniform int uMask; // Bitmask: 1=N, 2=E, 4=S, 8=W

// SDF Primitives
float sdCircle(vec2 p, float r) {
    return length(p) - r;
}

float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p)-b;
    return length(max(d,0.0)) + min(max(d.x,d.y),0.0);
}

// Smooth Min for metaball blending
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

// Noise
float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float snoise(vec2 v) {
    return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
    vec2 p = vUv * 2.0 - 1.0; // -1 to 1
    
    // Base shape: Circle in center
    float d = sdCircle(p, 0.4);
    
    // Connections
    float blend = 0.4; // Smoothness of connection
    float armWidth = 0.4;
    
    // North (1) -> y > 0
    if ((uMask & 1) != 0) {
        float arm = sdBox(p - vec2(0.0, 1.0), vec2(armWidth, 1.0));
        d = smin(d, arm, blend);
    }
    
    // East (2) -> x > 0
    if ((uMask & 2) != 0) {
        float arm = sdBox(p - vec2(1.0, 0.0), vec2(1.0, armWidth));
        d = smin(d, arm, blend);
    }
    
    // South (4) -> y < 0
    if ((uMask & 4) != 0) {
        float arm = sdBox(p - vec2(0.0, -1.0), vec2(armWidth, 1.0));
        d = smin(d, arm, blend);
    }
    
    // West (8) -> x < 0
    if ((uMask & 8) != 0) {
        float arm = sdBox(p - vec2(-1.0, 0.0), vec2(1.0, armWidth));
        d = smin(d, arm, blend);
    }
    
    // Organic Noise Distortion
    float noise = snoise(p * 3.0 + uTime * 0.5);
    d -= 0.05 * noise;
    
    // --- Rendering ---
    
    // Cutout
    float alpha = 1.0 - smoothstep(0.0, 0.05, d);
    if (alpha <= 0.0) discard;
    
    // Color / Shading
    vec3 col = uColor;
    
    // Darker Core
    col *= 0.8 + 0.4 * smoothstep(0.0, 0.5, abs(d)); // Lighter edges? No, darker core usually looks better or vice versa.
    // Let's do Lighter Center (Glow) -> Darker Edge (Membrane)
    // d is negative inside.
    // -d goes from 0 to large.
    float internalDist = -d;
    col = mix(uColor * 0.5, uColor * 1.5, smoothstep(0.0, 0.4, internalDist));
    
    // Cell Wall / Outline
    float outline = smoothstep(-0.1, 0.0, d);
    col = mix(col, uColor * 0.3, outline * 0.5); // Darken edge
    
    // Texture grain
    col += (rand(vUv * 10.0) - 0.5) * 0.1;

    gl_FragColor = vec4(col, alpha);
}
`;

export const OBSTACLE_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}
`;

export class ObstacleVisuals {
    public static createObstacleMesh(): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2); // Flat on XZ

        // Lift slightly? No, keep flush? 
        // Snake is at y=0. Fruits at 0.05.
        // Obstacles should block snake.
        // Let's put them at y=0.01 to cover grid lines but be below fruits?
        // Or y=0.2 to be "walls".
        // Let's try y=0.02.

        const material = new THREE.ShaderMaterial({
            vertexShader: OBSTACLE_VERTEX_SHADER,
            fragmentShader: OBSTACLE_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(0.6, 0.2, 0.2) }, // Organic Red/Brown
                uMask: { value: 0 }
            },
            transparent: true,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.02;

        return mesh;
    }
}
