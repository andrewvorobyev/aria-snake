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

// Exponential Smooth Min (Soft Min)
float sminExp(float a, float b, float k) {
    float res = exp(-k * a) + exp(-k * b);
    return -log(res) / k;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 p = vWorldPosition.xz;
    
    float k = 5.0; // Sharper blending to handle larger radii without losing shape
    
    float expSum = 0.0;
    vec3 colorSum = vec3(0.0);
    float weightSum = 0.0;
    
    for (int i = 0; i < ${MAX_POINTS}; i++) {
        if (i >= uPointCount) break;
        
        // Per-blob Radius Calculation
        float pointRadius;
        
        if (i == 0) {
            pointRadius = 0.75; 
        } else {
            // Body: 0.8 to 1.2x Head Size (0.6 to 0.9)
            // Traveling pulse wave
            float wave = sin(uTime * 5.0 - float(i) * 0.5);
            // Map wave (-1..1) to (0.6..0.9) -> Center 0.75, Amp 0.15
            pointRadius = ${CONFIG.SNAKE.CIRCLE_RADIUS} + wave * ${CONFIG.SNAKE.PULSE_AMPLITUDE}; 
        }
        
        float dist = length(p - uPoints[i]) - pointRadius;
        
        // Accumulate for Soft Min
        float w = exp(-k * dist * 1.0); // Adjusted blend weight
        
        float t = float(i) / float(max(uPointCount, 1));
        float hue = fract(t * 1.0 - uTime * 0.1); 
        vec3 col = hsv2rgb(vec3(hue, 0.85, 1.0));
        
        colorSum += col * w;
        weightSum += w;
        
        expSum += exp(-k * dist);
    }
    
    float d = -log(expSum) / k;
    
    if (d > 0.0) discard; // Strict surface at distance field = 0
    
    vec3 finalColor = colorSum / max(weightSum, 0.00001);
    
    // Height map for lighting (d is negative inside)
    float height = smoothstep(-uRadius, 0.0, d);
    height = 1.0 - height;
    
    // Simple Lighting
    finalColor *= mix(0.7, 1.1, height);
    
    // Specular
    float spec = smoothstep(0.7, 0.9, height); // Broader specular
    finalColor += vec3(1.0) * spec * 0.4;
    
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
