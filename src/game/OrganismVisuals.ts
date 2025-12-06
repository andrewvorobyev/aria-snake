import * as THREE from 'three';
import { CONFIG } from '../constants';

const ORGANISM_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const ORGANISM_FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uBlobs[20]; // x, z, radius
uniform int uBlobCount;

// Simplex Noise
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v){
    const vec4 C = vec4(0.211324865405187, 0.366025403784439,
        -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod(i, 289.0);
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
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
    return 130.0 * dot(m, g);
}

// Smooth Minimum for Metaballs
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

void main() {
    // Current pixel position in world space
    vec2 p = vWorldPosition.xz;

    // Calculate SDF (Signed Distance Field) for blob
    float d = 1000.0;

    for (int i = 0; i < 20; i++) {
        if (i >= uBlobCount) break;
        vec3 b = uBlobs[i]; // x, z, r
        float dist = length(p - b.xy) - b.z;
        d = smin(d, dist, 0.6); // Smooth blend factor 0.6
    }

    // Noise / Fuzziness
    float t = uTime * 2.0;

    // Domain Warping for organic feel
    vec2 warp = vec2(
        snoise(p * 0.5 + t * 0.1),
        snoise(p * 0.5 - t * 0.1)
    );
    p += warp * 0.2;

    // Fuzz (Spines) at edges
    float fuzzNoise = snoise(p * 8.0 + t);
    float fuzzStr = 0.15;

    // Apply fuzz to distance
    d += fuzzNoise * fuzzStr;

    // Rendering
    // d < 0 is inside, but SDF is usually negative inside. 
    // Here: dist = length - radius. So negative is inside.

    // Edge softness
    float alpha = 1.0 - smoothstep(0.0, 0.1, d);
    if (alpha <= 0.01) discard;

    // Color Logic
    // Center is WHITISH version of color (Cell body / Nucleus feel)
    vec3 paleCore = mix(uColor, vec3(1.0, 1.0, 1.0), 0.6); 

    // Mix Mask: Core vs Edge
    float mixMask = smoothstep(-0.4, 0.2, d); 
    
    // Invert mix: Pale center -> Pure Color edge
    vec3 col = mix(paleCore, uColor, mixMask);

    // Dust texture
    float dust = snoise(p * 15.0);
    col += dust * 0.05;

    gl_FragColor = vec4(col, alpha);
}
`;



// ... (Shader Code Omitted, assume it remains above) ...

export class OrganismVisuals {
    public mesh: THREE.Group;
    private bodyMesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;

    // Internal Eye Pool
    private eyePool: THREE.Group[] = [];
    private eyes: Map<number, { mesh: THREE.Group, blinkTimer: number, nextBlink: number, isBlinking: boolean }> = new Map();

    constructor() {
        this.mesh = new THREE.Group();

        const geometry = new THREE.PlaneGeometry(25, 25);
        geometry.rotateX(-Math.PI / 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: ORGANISM_VERTEX_SHADER,
            fragmentShader: ORGANISM_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(1, 0, 1) },
                uBlobs: { value: new Array(20).fill(0).map(() => new THREE.Vector3()) },
                uBlobCount: { value: 0 }
            },
            transparent: true,
            depthWrite: false,
        });

        this.bodyMesh = new THREE.Mesh(geometry, this.material);
        this.bodyMesh.renderOrder = 100;
        this.bodyMesh.frustumCulled = false;

        this.mesh.add(this.bodyMesh);
    }

    private createEye(): THREE.Group {
        const group = new THREE.Group();

        // Sclera
        const sGeo = new THREE.SphereGeometry(0.25, 16, 16);
        const sMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const sclera = new THREE.Mesh(sGeo, sMat);
        sclera.scale.set(1.0, 0.1, 1.0); // Flat disc
        group.add(sclera);

        // Pupil
        const pGeo = new THREE.SphereGeometry(0.12, 12, 12);
        const pMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
        const pupil = new THREE.Mesh(pGeo, pMat);
        pupil.position.y = 0.05;
        pupil.scale.set(1.0, 0.1, 1.0);
        pupil.name = 'pupil'; // Tag for updates
        group.add(pupil);

        return group;
    }

    private getEye(): THREE.Group {
        if (this.eyePool.length > 0) return this.eyePool.pop()!;
        return this.createEye();
    }

    private returnEye(eye: THREE.Group) {
        eye.visible = false;
        this.mesh.remove(eye);
        this.eyePool.push(eye);
    }

    public update(nodes: { x: number, z: number, r: number, hasEye?: boolean }[], dt: number) {
        this.material.uniforms.uTime.value += dt;
        const t = this.material.uniforms.uTime.value;

        const count = Math.min(nodes.length, 20);
        this.material.uniforms.uBlobCount.value = count;

        let cx = 0, cz = 0;
        const blobs = this.material.uniforms.uBlobs.value as THREE.Vector3[];

        const currentEyeIndices = new Set<number>();

        for (let i = 0; i < count; i++) {
            const node = nodes[i];
            blobs[i].set(node.x, node.z, node.r);
            cx += node.x;
            cz += node.z;


            if (node.hasEye) {
                currentEyeIndices.add(i);

                const eyesConf = CONFIG.ORGANISMS.EYES;

                // Get or Create Eye State
                let eyeState = this.eyes.get(i);
                if (!eyeState) {
                    const mesh = this.getEye();
                    mesh.visible = true;
                    // Initial scale
                    mesh.scale.setScalar(0.7);
                    this.mesh.add(mesh);

                    const minB = eyesConf.BLINK_INTERVAL.MIN;
                    const maxB = eyesConf.BLINK_INTERVAL.MAX;

                    eyeState = {
                        mesh: mesh,
                        blinkTimer: 0,
                        nextBlink: minB + Math.random() * (maxB - minB),
                        isBlinking: false
                    };
                    this.eyes.set(i, eyeState);
                }

                // --- Update Eye Visuals ---
                const { mesh } = eyeState;

                // 1. Blink Logic
                eyeState.blinkTimer += dt;
                let openY = 0.7; // Base scale
                if (eyeState.isBlinking) {
                    const blinkDur = 0.15;
                    const bt = eyeState.blinkTimer / blinkDur;
                    if (bt >= 1.0) {
                        eyeState.isBlinking = false;
                        const minB = eyesConf.BLINK_INTERVAL.MIN;
                        const maxB = eyesConf.BLINK_INTERVAL.MAX;
                        eyeState.nextBlink = minB + Math.random() * (maxB - minB);
                        eyeState.blinkTimer = 0;
                    } else {
                        // Close 1 -> 0 -> 1
                        openY *= (1.0 - Math.sin(bt * Math.PI));
                        // Ensure minimal thickness so it doesn't invert/glitch
                        if (openY < 0.05) openY = 0.05;
                    }
                } else if (eyeState.blinkTimer > eyeState.nextBlink) {
                    eyeState.isBlinking = true;
                    eyeState.blinkTimer = 0;
                }

                // Apply Scale (Squash Y to blink)
                mesh.scale.set(0.7, openY, 0.7); // 0.7 is base visual scale

                // 2. Position (Wander inside blob)
                const seed = i * 99.0;
                // Wander 30% of radius
                const wanderR = node.r * 0.3;

                // Slow down the wandering motion
                const ws = eyesConf.WANDER_SPEED;
                const wx = Math.sin(t * ws + seed) * wanderR;
                const wz = Math.cos(t * (ws * 0.8) + seed * 1.1) * wanderR;

                mesh.position.set(node.x + wx, 0.5, node.z + wz);

                // 3. Pupil Look
                // Loop around slowly
                const pupil = mesh.getObjectByName('pupil');
                if (pupil) {
                    // Slow down pupil movement
                    const ps = eyesConf.PUPIL_SPEED;
                    pupil.position.x = Math.cos(t * ps + seed) * 0.08;
                    pupil.position.z = Math.sin(t * (ps * 0.8) + seed) * 0.08;
                    // Reset Y because scaling might affect
                    pupil.position.y = 0.06;
                }
            }
        }

        // Cleanup
        for (const [idx, state] of this.eyes) {
            if (!currentEyeIndices.has(idx)) {
                this.returnEye(state.mesh);
                this.eyes.delete(idx);
            }
        }

        if (count > 0) {
            cx /= count;
            cz /= count;
            this.bodyMesh.position.set(cx, 0.1, cz);
        }
    }

    public setColor(color: THREE.Color) {
        this.material.uniforms.uColor.value.copy(color);
    }
}
