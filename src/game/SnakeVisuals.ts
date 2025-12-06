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
    private eyeBall: THREE.Mesh;
    private pupil: THREE.Mesh;
    private side: number; // -1 for left, 1 for right
    private blinkTimer: number = 0;
    private blinkState: 'open' | 'closing' | 'opening' | 'closed' = 'open';
    private blinkDuration: number = 0.1;
    private openDuration: number = 0;

    constructor(side: number) {
        this.side = side;
        this.mesh = new THREE.Group();

        // Eyeball - Slightly flattened sphere
        const wGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const wMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.eyeBall = new THREE.Mesh(wGeo, wMat);
        this.eyeBall.scale.set(1, 0.8, 0.6); // Flattened

        // Pupil - Black disk/sphere on front
        const pGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.pupil = new THREE.Mesh(pGeo, pMat);
        this.pupil.position.z = 0.22; // Protrude slightly
        this.pupil.scale.z = 0.5;

        this.eyeBall.add(this.pupil);
        this.mesh.add(this.eyeBall);

        // Initial Blink Timer
        this.resetBlinkTimer();
    }

    private resetBlinkTimer() {
        this.openDuration = 2.0 + Math.random() * 4.0; // Random blink interval 2-6s
        this.blinkTimer = 0;
    }

    public update(dt: number, headPos: THREE.Vector2, angle: number) {
        // Blinking Animation
        this.blinkTimer += dt;
        let scaleY = 1.0;

        switch (this.blinkState) {
            case 'open':
                if (this.blinkTimer > this.openDuration) {
                    this.blinkState = 'closing';
                    this.blinkTimer = 0;
                }
                break;
            case 'closing':
                scaleY = 1.0 - (this.blinkTimer / this.blinkDuration);
                if (scaleY <= 0.0) {
                    scaleY = 0.0;
                    this.blinkState = 'opening'; // Immediate reopen for quick blink
                    this.blinkTimer = 0;
                }
                break;
            case 'opening':
                scaleY = clientScaleY(this.blinkTimer / this.blinkDuration);
                if (scaleY >= 1.0) {
                    scaleY = 1.0;
                    this.blinkState = 'open';
                    this.resetBlinkTimer();
                }
                break;
        }

        // Helper for clamp
        function clientScaleY(v: number) { return v < 0 ? 0 : v > 1 ? 1 : v; }

        this.eyeBall.scale.y = Math.max(0.1, scaleY * 0.8); // Keep 0.8 base aspect

        // Positioning
        // Offset eyes to sides of head
        // Head Radius is ~0.75. Place eyes at ~0.5 distance, +/- 45 degrees
        const eyeOffsetDist = 0.45;
        const eyeAngleOffset = this.side * 0.6; // +/- radians

        const finalAngle = angle + eyeAngleOffset;

        const offsetX = Math.cos(finalAngle) * eyeOffsetDist;
        const offsetZ = Math.sin(finalAngle) * eyeOffsetDist;

        // Target Position
        this.mesh.position.set(headPos.x + offsetX, 0.8, headPos.y + offsetZ);

        // Orientation: Eyes look forward (same as head angle)
        // Adjust mesh rotation. Three.js Y is Up. 
        // We are working in XZ plane primarily.
        // Mesh Y-up. Rotation Z rotates around Up axis in this setup? 
        // No, standard Three.js: Y is Up. 
        // We want to rotate around Y axis to face 'angle' direction.
        // But our Plane was rotated X -90.
        // Let's set rotation directly.

        // Correction: atan2(y, x) gives angle from X axis CCW.
        // Threejs Rotation Y: CCW.
        // But we want to look at angle. 
        // Mesh default checks +Z?
        // Sphere default ...

        this.mesh.rotation.y = -angle; // Invert? Try and see.
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
            let lastP = snakePath[0];

            for (let i = 1; i < snakePath.length; i++) {
                if (visualPoints.length >= maxBlobs) break;

                const p = snakePath[i];
                if (p.distanceTo(lastP) > 0.9) {
                    visualPoints.push(new THREE.Vector2(p.x, p.z));
                    lastP = p;
                }
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
}
