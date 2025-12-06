import * as THREE from 'three';
import { CONFIG } from '../constants';

const MAX_POINTS = 100;

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
varying vec3 vWorldPosition;
varying vec2 vUv;

uniform vec2 uPoints[${MAX_POINTS}];
uniform int uPointCount;
uniform float uTime;
uniform float uRadius;

// --- NOISE FUNCTIONS ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }

// Simplex Noise (2D)
float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i  = floor(v + dot(v, C.yy) );
    vec2 x0 = v -   i + dot(i, C.xx);
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

// Voronoi / Cellular Noise
float cellular(vec2 P) {
    const float K = 0.142857142857; // 1/7
    const float K2 = 0.0714285714286; // K/2
    const float jitter = 0.8;
    
    vec2 Pi = mod(floor(P), 289.0);
    vec2 Pf = fract(P);
    vec3 oi = vec3(-1.0, 0.0, 1.0);
    vec3 of = vec3(-0.5, 0.5, 1.5);
    vec3 px = permute(Pi.x + oi);
    vec3 p = permute(px.x + Pi.y + oi); // p11, p12, p13
    vec3 ox = fract(p*K) - K2;
    vec3 oy = mod(floor(p*K),7.0)*K - K2;
    vec3 dx = Pf.x - 0.5 + jitter*ox;
    vec3 dy = Pf.y - of + jitter*oy;
    vec3 d1 = dx * dx + dy * dy; // d11, d12, d13
    
    p = permute(px.y + Pi.y + oi); // p21, p22, p23
    ox = fract(p*K) - K2;
    oy = mod(floor(p*K),7.0)*K - K2;
    dx = Pf.x - 1.5 + jitter*ox;
    dy = Pf.y - of + jitter*oy; // Reuse dy
    vec3 d2 = dx * dx + dy * dy; // d21, d22, d23
    
    p = permute(px.z + Pi.y + oi); // p31, p32, p33
    ox = fract(p*K) - K2;
    oy = mod(floor(p*K),7.0)*K - K2;
    dx = Pf.x - 0.5 + jitter*ox;
    dy = Pf.y - of + jitter*oy; // Reuse dy
    vec3 d3 = dx * dx + dy * dy; // d31, d32, d33
    
    vec3 d1a = min(d1, d2);
    d2 = max(d1, d2);
    d2 = min(d2, d3);
    d1 = min(d1a, d3);
    d1.x = min(d1.x, d1.y);
    return sqrt(d1.x); // F1
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 p = vWorldPosition.xz;
    float k = 4.0;
    
    // Accumulators
    float expSum = 0.0;
    vec3 colorSum = vec3(0.0);
    float patternSum = 0.0; // Organic pattern
    float weightSum = 0.0;
    
    for (int i = 0; i < ${MAX_POINTS}; i++) {
        if (i >= uPointCount) break;
        
        // Calculate Radius
        float pointRadius;
        if (i == 0) {
            pointRadius = 0.75; 
        } else {
            float wave = sin(uTime * 5.0 - float(i) * 0.5);
            pointRadius = ${CONFIG.SNAKE.CIRCLE_RADIUS} + wave * ${CONFIG.SNAKE.PULSE_AMPLITUDE}; 
        }
        
        vec2 diff = p - uPoints[i];
        float dist = length(diff) - pointRadius;
        float w = exp(-k * dist);
        
        // --- ORGANIC PATTERN GENERATION ---
        
        // Use local coords 'diff' so pattern moves with body.
        // Use VERY small offset per segment to ensure continuity (blends seamlessly).
        vec2 patUV = diff * 2.5; 
        float drift = float(i) * 0.05; // Gradual evolution along body, no hard breaks
        
        // 1. Domain Warping for fluid/tissue look
        vec2 warp = vec2(
            snoise(patUV + vec2(uTime * 0.2, drift)),
            snoise(patUV + vec2(drift, uTime * 0.25) + vec2(4.1, 2.3))
        );
        
        // 2. Base Pattern (Veins/Spots)
        float noiseVal = snoise(patUV + warp * 0.5 - vec2(uTime * 0.1));
        
        // 3. Process into "Spots"
        // -1..1 -> 0..1
        float spots = smoothstep(-0.3, 0.6, noiseVal);
        
        // --- Color ---
        float t = float(i) / float(max(uPointCount, 1));
        float hue = fract(t * 1.0 - uTime * 0.1); 
        vec3 col = hsv2rgb(vec3(hue, 0.7, 1.0));
        
        colorSum += col * w;
        patternSum += spots * w; // Accumulate pattern
        weightSum += w;
        expSum += w;
    }
    
    float invK = 1.0 / k;
    float d = -log(expSum) * invK;
    
    // Normalize Weighted Data
    float normFactor = 1.0 / max(weightSum, 0.00001);
    vec3 baseColor = colorSum * normFactor;
    float pattern = patternSum * normFactor;
    
    // --- Spines / Cilia (Edge Noise) ---
    // World space noise for "moving through field" effect
    float spineNoise = snoise(p * 15.0 - uTime * 2.0); 
    float spineStr = 0.15;
    d += spineNoise * spineStr;

    if (d > 0.0) discard; 
    
    // --- Lighting & Surface ---
    
    // Derivative of D for normal
    vec3 dx = dFdx(vec3(d, p.x, p.y));
    vec3 dy = dFdy(vec3(d, p.x, p.y));
    
    vec2 slope = vec2(dFdx(d), dFdy(d)) * 30.0; 
    
    // Add Pattern Bump
    // The pattern changes color AND surface relief
    slope += vec2(dFdx(pattern), dFdy(pattern)) * 5.0;
    
    vec3 normal = normalize(vec3(slope.x, slope.y, 1.0));
    
    // Lighting Vectors
    vec3 lightDir = normalize(vec3(0.5, 0.7, 1.0)); 
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    
    // Diffuse
    float ndl = dot(normal, lightDir);
    float diffuse = max(0.0, ndl * 0.5 + 0.5); 
    
    // Specular
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 16.0); 
    
    // Rim
    float rim = 1.0 - max(0.0, dot(normal, viewDir));
    rim = pow(rim, 3.0);
    
    // --- Composition ---
    
    // Map Pattern to visual features
    // pattern 0..1 (Spots)
    // Darken inside spots (Nuclei)
    vec3 tissueColor = baseColor * (0.6 + 0.4 * (1.0 - pattern));
    
    // Veins (Edges of spots)
    // glowing network
    float veinMask = 1.0 - abs(pattern - 0.5) * 2.0; // Peak at 0.5
    veinMask = pow(veinMask, 4.0);
    
    vec3 finalColor = tissueColor * diffuse;
    
    // Add glowing veins
    finalColor += vec3(1.0, 0.9, 0.6) * veinMask * 0.3;
    
    // Membrane Glow at edge
    float membrane = smoothstep(-0.15, 0.0, d);
    finalColor += vec3(0.2, 0.8, 0.6) * membrane * 0.6; 

    // Add Lights
    finalColor += vec3(1.0) * spec * 0.4;
    finalColor += vec3(0.5, 0.9, 1.0) * rim * 0.5;
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

class SnakeEye {
    public mesh: THREE.Group;
    private eyeContainer: THREE.Group;
    private eyeBall: THREE.Mesh;
    private pupil: THREE.Mesh;
    private side: number;

    // Animation State
    private time: number = 0;
    private blinkTimer: number = 0;
    private isBlinking: boolean = false;
    private blinkDuration: number = 0.15;
    private nextBlink: number = 0;

    constructor(side: number) {
        this.side = side;
        this.mesh = new THREE.Group();
        this.mesh.renderOrder = 10;

        // Container for scaling/blinking
        this.eyeContainer = new THREE.Group();
        this.mesh.add(this.eyeContainer);

        // Eyeball - Flat Disc
        const wGeo = new THREE.SphereGeometry(0.25, 24, 24);
        const wMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.eyeBall = new THREE.Mesh(wGeo, wMat);
        this.eyeBall.scale.set(1.0, 0.1, 1.0); // Flatten Y
        this.eyeContainer.add(this.eyeBall);

        // Pupil - Flat Disc on top
        const pGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.pupil = new THREE.Mesh(pGeo, pMat);
        this.pupil.position.y = 0.05; // Slightly above eyeball
        this.pupil.scale.set(1.0, 0.1, 1.0); // Flatten Y
        this.eyeContainer.add(this.pupil);

        this.setNextBlink();
    }

    private setNextBlink() {
        this.nextBlink = 1.0 + Math.random() * 3.0;
        this.blinkTimer = 0;
        this.isBlinking = false;
    }

    public triggerBlink() {
        this.isBlinking = true;
        this.blinkTimer = 0;
    }

    public update(dt: number, headPos: THREE.Vector2, angle: number) {
        this.time += dt;

        // --- Blink Logic ---
        this.blinkTimer += dt;
        let blinkScale = 1.0;

        if (this.isBlinking) {
            const t = this.blinkTimer / this.blinkDuration;
            if (t >= 1.0) {
                this.isBlinking = false;
                this.setNextBlink();
            } else {
                const v = Math.sin(t * Math.PI); // Goes 0 -> 1 -> 0
                blinkScale = 1.0 - v; // Goes 1 -> 0 -> 1 (open -> closed -> open)
            }
        } else if (this.blinkTimer > this.nextBlink) {
            this.triggerBlink();
        }

        // Squash along Local X (Forward relative to eye rotation) to "Close" the eye
        // Ensure it doesn't go to exactly 0 to avoid division by zero or rendering issues
        this.eyeContainer.scale.x = Math.max(0.01, blinkScale);

        // --- Pulsing ---
        // Asymmetric size pulse
        const pulse = Math.sin(this.time * 4.0 + this.side) * 0.1 + 1.0;
        this.eyeContainer.scale.z = pulse; // Pulse width (side-to-side)
        // (X is driven by blink)

        // --- Pupil Movement ---
        // Tend to middle (0,0), add noise
        // Local X/Z coordinates
        const noiseX = Math.cos(this.time * 1.5 + this.side) * 0.05;
        const noiseZ = Math.sin(this.time * 2.0) * 0.05;
        this.pupil.position.x = noiseX;
        this.pupil.position.z = noiseZ;

        // --- Positioning ---
        const forward = 0.2;
        const sideOffset = this.side * 0.35;

        // Calculate World position
        // Rotate offsets by angle
        // Angle is direction CCW from +X (East)

        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);

        // Forward vector components
        const fx = cosAngle * forward;
        const fz = sinAngle * forward;

        // Side vector components (perpendicular to forward, rotated by -PI/2)
        const sx = Math.cos(angle - Math.PI / 2) * sideOffset;
        const sz = Math.sin(angle - Math.PI / 2) * sideOffset;

        const finalX = headPos.x + fx + sx;
        const finalZ = headPos.y + fz + sz; // headPos.y is world Z

        this.mesh.position.set(finalX, 1.0, finalZ);

        // Rotate meshes to face forward
        // Mesh Y-rotation: -angle aligns the mesh's local +X axis with the snake's forward direction
        this.mesh.rotation.y = -angle;
    }
}

export class SnakeVisuals {
    public mesh: THREE.Group;
    private slimeMesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;
    private eyes: SnakeEye[] = [];

    constructor() {
        this.mesh = new THREE.Group();

        const geometry = new THREE.PlaneGeometry(100, 100);
        geometry.rotateX(-Math.PI / 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uPoints: { value: new Array(MAX_POINTS).fill(new THREE.Vector2(0, 0)) },
                uPointCount: { value: 0 },
                uTime: { value: 0 },
                uRadius: { value: 0.35 }
            },
            transparent: true,
            depthWrite: true,
        });

        this.slimeMesh = new THREE.Mesh(geometry, this.material);
        this.slimeMesh.position.y = 0.05;
        this.mesh.add(this.slimeMesh);

        // Create 2 Eyes
        const leftEye = new SnakeEye(-1);
        const rightEye = new SnakeEye(1);
        this.eyes.push(leftEye, rightEye);
        this.mesh.add(leftEye.mesh);
        this.mesh.add(rightEye.mesh);
    }

    public update(dt: number, snakePath: THREE.Vector3[]) {
        const time = this.material.uniforms.uTime.value + dt;
        this.material.uniforms.uTime.value = time;

        // Pulse logic in shader

        // Sampling points
        const visualPoints: THREE.Vector2[] = [];
        const maxBlobs = CONFIG.SNAKE.INITIAL_LENGTH;

        if (snakePath.length > 0) {
            visualPoints.push(new THREE.Vector2(snakePath[0].x, snakePath[0].z));

            let currentPathDist = 0;
            let nextBlobDist = 0.9;

            for (let i = 0; i < snakePath.length - 1; i++) {
                if (visualPoints.length >= maxBlobs) break;

                const p1 = snakePath[i];
                const p2 = snakePath[i + 1];
                const segLen = p1.distanceTo(p2);

                // If segment length is tiny, skip to avoid division by zero issues
                if (segLen < 0.0001) continue;

                while (currentPathDist + segLen >= nextBlobDist) {
                    if (visualPoints.length >= maxBlobs) break;

                    // Calculate interpolation factor
                    const distOnSeg = nextBlobDist - currentPathDist;
                    const alpha = distOnSeg / segLen;

                    // Interpolate
                    const interpX = p1.x + (p2.x - p1.x) * alpha;
                    const interpZ = p1.z + (p2.z - p1.z) * alpha;

                    visualPoints.push(new THREE.Vector2(interpX, interpZ));

                    nextBlobDist += 0.9;
                }

                currentPathDist += segLen;
            }
        }

        this.material.uniforms.uPointCount.value = visualPoints.length;

        for (let i = 0; i < visualPoints.length; i++) {
            this.material.uniforms.uPoints.value[i] = visualPoints[i];
        }

        // Update Eyes
        if (visualPoints.length > 1) {
            const head = visualPoints[0];
            const neck = visualPoints[1];

            // Direction Vector
            const dx = head.x - neck.x;
            const dy = head.y - neck.y; // Z is Y here

            // Standard Angle
            const angle = Math.atan2(dy, dx);

            for (const eye of this.eyes) {
                eye.update(dt, head, angle);
            }
        }
    }

    public triggerBlink() {
        for (const eye of this.eyes) {
            eye.triggerBlink();
        }
    }
}
