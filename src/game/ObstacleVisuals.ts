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
    
    // Morphing Noise
    float morph = snoise(p * 3.0 + uTime * 1.0) * 0.04;
    
    // Base shape: Rectangular Box (Oversized)
    float boxSize = 0.95;
    float d = sdBox(p, vec2(boxSize, boxSize)) - 0.05; 
    
    // Connections
    float blend = 0.01; // Hard union for straight edges
    float armWidth = 0.95; 
    
    float linkPulse = 0.0;
    
    // Pulse Settings
    float beamWidth = 0.12; 
    float flowSpeed = 10.0;
    
    // North (1) -> y > 0
    if ((uMask & 1) != 0) {
        // Extend slightly past 1.0 to ensure overlap
        float arm = sdBox(p - vec2(0.0, 1.05), vec2(armWidth, 1.05));
        d = smin(d, arm, blend);
        
        // Pulse: Vertical line x=0
        float beam = smoothstep(beamWidth, 0.02, abs(p.x)) * step(0.0, p.y);
        float flow = 0.5 + 0.5 * sin(p.y * 10.0 - uTime * flowSpeed);
        linkPulse += beam * flow;
    }
    
    // East (2) -> x > 0
    if ((uMask & 2) != 0) {
        float arm = sdBox(p - vec2(1.05, 0.0), vec2(1.05, armWidth));
        d = smin(d, arm, blend);
        
        // Pulse: Horizontal line y=0
        float beam = smoothstep(beamWidth, 0.02, abs(p.y)) * step(0.0, p.x);
        float flow = 0.5 + 0.5 * sin(p.x * 10.0 - uTime * flowSpeed);
        linkPulse += beam * flow;
    }
    
    // South (4) -> y < 0
    if ((uMask & 4) != 0) {
        float arm = sdBox(p - vec2(0.0, -1.05), vec2(armWidth, 1.05));
        d = smin(d, arm, blend);
        
        float beam = smoothstep(beamWidth, 0.02, abs(p.x)) * step(0.0, -p.y);
        float flow = 0.5 + 0.5 * sin(-p.y * 10.0 - uTime * flowSpeed);
        linkPulse += beam * flow;
    }
    
    // West (8) -> x < 0
    if ((uMask & 8) != 0) {
        float arm = sdBox(p - vec2(-1.05, 0.0), vec2(1.05, armWidth));
        d = smin(d, arm, blend);
        
        float beam = smoothstep(beamWidth, 0.02, abs(p.y)) * step(0.0, -p.x);
        float flow = 0.5 + 0.5 * sin(-p.x * 10.0 - uTime * flowSpeed);
        linkPulse += beam * flow;
    }
    
    // Apply Morph (less intense)
    d -= morph * 0.5;
    
    // --- Rendering ---
    
    // Cutout
    float alpha = 1.0 - smoothstep(0.0, 0.02, d);
    if (alpha <= 0.0) discard;
    
    // Color / Shading
    vec3 col = uColor;
    
    // Bevel
    col *= 0.6 + 0.4 * smoothstep(-0.2, -0.8, d); 
    
    // Add Link Pulse (Bright Cyan/Teal for contrast)
    // Make it distinct
    vec3 pulseCol = vec3(0.2, 0.9, 1.0);
    col = mix(col, pulseCol, linkPulse * 0.8); // Override color where pulse is
    
    // Dark Outline
    float outline = smoothstep(-0.05, 0.0, d);
    col = mix(col, vec3(0.0), outline);
    
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
        // Snake is at y=0.05. Fruits at 0.05.
        // Obstacles should block snake.
        // Let's put them at y=0.01 to cover grid lines but be below fruits?
        // Or y=0.2 to be "walls".
        // Let's try y=0.02.

        const material = new THREE.ShaderMaterial({
            vertexShader: OBSTACLE_VERTEX_SHADER,
            fragmentShader: OBSTACLE_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(0.18, 0.1, 0.25) }, // Stylish Deep Indigo/Plum
                uMask: { value: 0 }
            },
            transparent: true,
            side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = 0.02; // Keep at 0.02

        return mesh;
    }
}
