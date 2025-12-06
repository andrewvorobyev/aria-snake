import * as THREE from 'three';
import { CONFIG } from '../constants';

const MAX_POINTS = 200;

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

// Eat Pulse
uniform float uEatTime; // 0..Duration, negative if inactive
uniform vec3 uEatColor; // Configured color
uniform float uPulseSpeed;
uniform vec3 uSpineColor; // New Spine Color

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
    float patternSum = 0.0; 
    float weightSum = 0.0;
    
    // Pulse Logic Precalc
    float pulsePos = -1.0;
    float pulseWidth = 0.3;
    if (uEatTime >= 0.0) {
        pulsePos = uEatTime * uPulseSpeed; // Position 0..1+ along body
    }
    
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
        
        // --- PATTERN ---
        vec2 patUV = diff * 2.5; 
        float drift = float(i) * 0.05; 
        vec2 warp = vec2(
            snoise(patUV + vec2(uTime * 0.2, drift)),
            snoise(patUV + vec2(drift, uTime * 0.25) + vec2(4.1, 2.3))
        );
        float noiseVal = snoise(patUV + warp * 0.5 - vec2(uTime * 0.1));
        float spots = smoothstep(-0.3, 0.6, noiseVal);
        
        // --- COLOR ---
        float t = float(i) / float(max(uPointCount, 1));
        float hue = fract(t * 1.0 - uTime * 0.1); 
        vec3 col = hsv2rgb(vec3(hue, 0.45, 1.0)); 
        
        // MIX EAT PULSE
        if (pulsePos > -0.5) {
            // Dist from pulse wave
            float dPulse = abs(t - pulsePos);
            // Bell curve shape
            float pulseStr = smoothstep(pulseWidth, 0.0, dPulse);
            
            // Fade out towards tail (t=1)
            float fade = 1.0 - smoothstep(0.0, 1.0, t); 
            
            // Combine
            pulseStr *= fade * 2.5; 
            
            vec3 eatCol = mix(col, uEatColor, clamp(pulseStr, 0.0, 1.0));
            // Apply color
            col = eatCol;
            
            // ENLARGE (Local Bulge)
            // Increase weight w based on pulse strength
            // This swells the metaball field locally
            w *= (1.0 + pulseStr * 1.5); 
        }

        colorSum += col * w;
        patternSum += spots * w; 
        weightSum += w;
        expSum += w;
    }
    
    float invK = 1.0 / k;
    float d = -log(expSum) * invK;
    
    float normFactor = 1.0 / max(weightSum, 0.00001);
    vec3 baseColor = colorSum * normFactor;
    float pattern = patternSum * normFactor;
    
    vec3 color = baseColor;

    // --- Spines / Cilia ---
    float spineNoise = snoise(p * 15.0 - uTime * 2.0); 
    float spineStr = 0.15;
    d += spineNoise * spineStr;

    if (d > 0.0) discard; 
    
    // --- Lighting ---
    vec3 dx = dFdx(vec3(d, p.x, p.y));
    vec3 dy = dFdy(vec3(d, p.x, p.y));
    vec2 slope = vec2(dFdx(d), dFdy(d)) * 30.0; 
    slope += vec2(dFdx(pattern), dFdy(pattern)) * 5.0;
    vec3 normal = normalize(vec3(slope.x, slope.y, 1.0));
    
    vec3 lightDir = normalize(vec3(0.5, 0.7, 1.0)); 
    vec3 viewDir = vec3(0.0, 0.0, 1.0);
    float ndl = dot(normal, lightDir);
    float diffuse = max(0.0, ndl * 0.5 + 0.5); 
    vec3 halfVec = normalize(lightDir + viewDir);
    float spec = pow(max(0.0, dot(normal, halfVec)), 16.0); 
    float rim = pow(1.0 - max(0.0, dot(normal, viewDir)), 3.0);
    
    // Comp
    // Map Pattern to visual features
    // pattern 0..1 (Spots)
    // Darken inside spots (Nuclei)
    vec3 tissueColor = baseColor * (0.8 + 0.2 * (1.0 - pattern));
    
    // RED SPINE
    // Thin and Continuous
    // Tighten the range deep inside the signed distance field.
    // The deeper the value (more negative), the more central.
    float coreMask = smoothstep(-0.55, -0.65, d); 
    tissueColor = mix(tissueColor, uSpineColor, coreMask); 

    // Veins (Edges of spots)
    // glowing network
    float veinMask = 1.0 - abs(pattern - 0.5) * 2.0; // Peak at 0.5
    veinMask = pow(veinMask, 4.0);
    
    vec3 finalColor = tissueColor * diffuse;
    finalColor = mix(finalColor, vec3(0.1, 0.0, 0.2), veinMask * 0.5);
    float membrane = smoothstep(-0.2, 0.0, d);
    finalColor = mix(finalColor, vec3(0.0, 0.05, 0.1), membrane * 0.8); 
    finalColor += vec3(1.0) * spec * 0.4;
    finalColor += vec3(0.5, 0.9, 1.0) * rim * 0.5;
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class SnakeEye { // ... (Keep SnakeEye as is)
    public mesh: THREE.Group;
    private eyeContainer: THREE.Group;
    private eyeBall: THREE.Mesh;
    private pupil: THREE.Mesh;
    private side: number;
    private time: number = 0;
    private blinkTimer: number = 0;
    private isBlinking: boolean = false;
    private blinkDuration: number = 0.15;
    private nextBlink: number = 0;

    constructor(side: number) {
        this.side = side;
        this.mesh = new THREE.Group();
        this.mesh.renderOrder = 10;
        this.eyeContainer = new THREE.Group();
        this.mesh.add(this.eyeContainer);

        const wGeo = new THREE.SphereGeometry(0.25, 24, 24);
        const wMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.eyeBall = new THREE.Mesh(wGeo, wMat);
        this.eyeBall.scale.set(1.0, 0.1, 1.0);
        this.eyeContainer.add(this.eyeBall);

        const pGeo = new THREE.SphereGeometry(0.12, 16, 16);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        this.pupil = new THREE.Mesh(pGeo, pMat);
        this.pupil.position.y = 0.05;
        this.pupil.scale.set(1.0, 0.1, 1.0);
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
        this.blinkTimer += dt;
        let blinkScale = 1.0;
        if (this.isBlinking) {
            const t = this.blinkTimer / this.blinkDuration;
            if (t >= 1.0) { this.isBlinking = false; this.setNextBlink(); }
            else { blinkScale = 1.0 - Math.sin(t * Math.PI); }
        } else if (this.blinkTimer > this.nextBlink) { this.triggerBlink(); }
        this.eyeContainer.scale.x = Math.max(0.01, blinkScale);
        const pulse = Math.sin(this.time * 4.0 + this.side) * 0.1 + 1.0;
        this.eyeContainer.scale.z = pulse;
        const noiseX = Math.cos(this.time * 1.5 + this.side) * 0.05;
        const noiseZ = Math.sin(this.time * 2.0) * 0.05;
        this.pupil.position.x = noiseX;
        this.pupil.position.z = noiseZ;
        const forward = 0.2;
        const sideOffset = this.side * 0.35;
        const cosAngle = Math.cos(angle);
        const sinAngle = Math.sin(angle);
        const fx = cosAngle * forward;
        const fz = sinAngle * forward;
        const sx = Math.cos(angle - Math.PI / 2) * sideOffset;
        const sz = Math.sin(angle - Math.PI / 2) * sideOffset;
        const finalX = headPos.x + fx + sx;
        const finalZ = headPos.y + fz + sz;
        this.mesh.position.set(finalX, 1.0, finalZ);
        this.mesh.rotation.y = -angle;
    }
}

export class SnakeVisuals {
    public mesh: THREE.Group;
    private slimeMesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;
    private eyes: SnakeEye[] = [];
    private eatTimer: number = -1.0;

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
                uRadius: { value: 0.35 },
                uEatTime: { value: -1.0 },
                uEatColor: { value: new THREE.Color(CONFIG.SNAKE.EAT_PULSE.COLOR) },
                uPulseSpeed: { value: CONFIG.SNAKE.EAT_PULSE.SPEED },
                uSpineColor: { value: new THREE.Color(CONFIG.SNAKE.SPINE_COLOR) }
            },
            transparent: true,
            depthWrite: true,
        });

        this.slimeMesh = new THREE.Mesh(geometry, this.material);
        this.slimeMesh.position.y = 0.05;
        this.mesh.add(this.slimeMesh);

        const leftEye = new SnakeEye(-1);
        const rightEye = new SnakeEye(1);
        this.eyes.push(leftEye, rightEye);
        this.mesh.add(leftEye.mesh);
        this.mesh.add(rightEye.mesh);
    }
    public triggerEat() {
        this.eatTimer = 0.0;
    }
    public update(dt: number, snakePath: THREE.Vector3[]) {
        const time = this.material.uniforms.uTime.value + dt;
        this.material.uniforms.uTime.value = time;

        if (this.eatTimer >= 0.0) {
            this.eatTimer += dt;
            if (this.eatTimer > CONFIG.SNAKE.EAT_PULSE.DURATION) {
                this.eatTimer = -1.0;
            }
        }
        this.material.uniforms.uEatTime.value = this.eatTimer;

        const visualPoints: THREE.Vector2[] = [];


        if (snakePath.length > 0) {
            visualPoints.push(new THREE.Vector2(snakePath[0].x, snakePath[0].z));

            let currentPathDist = 0;
            let nextBlobDist = 0.45; // Increased density

            for (let i = 0; i < snakePath.length - 1; i++) {
                if (visualPoints.length >= MAX_POINTS) break;

                const p1 = snakePath[i];
                const p2 = snakePath[i + 1];
                const segLen = p1.distanceTo(p2);

                if (segLen < 0.0001) continue;

                while (currentPathDist + segLen >= nextBlobDist) {
                    if (visualPoints.length >= MAX_POINTS) break;

                    const distOnSeg = nextBlobDist - currentPathDist;
                    const alpha = distOnSeg / segLen;
                    const interpX = p1.x + (p2.x - p1.x) * alpha;
                    const interpZ = p1.z + (p2.z - p1.z) * alpha;

                    visualPoints.push(new THREE.Vector2(interpX, interpZ));
                    nextBlobDist += 0.45;
                }
                currentPathDist += segLen;
            }
        }

        this.material.uniforms.uPointCount.value = visualPoints.length;

        for (let i = 0; i < visualPoints.length; i++) {
            this.material.uniforms.uPoints.value[i] = visualPoints[i];
        }

        if (visualPoints.length > 1) {
            const head = visualPoints[0];
            const neck = visualPoints[1];
            const dx = head.x - neck.x;
            const dy = head.y - neck.y;
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
