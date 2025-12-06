import * as THREE from 'three';

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
    vec3 darkCore = vec3(0.01, 0.01, 0.01);

    // Mix Mask: Core vs Edge
    // d ranges from -Radius (center) to +Fuzz (outside)
    // We want deep black center, glowing edge.
    float mixMask = smoothstep(-0.4, 0.1, d); 
    
    vec3 col = mix(darkCore, uColor, mixMask);

    // Dust texture
    float dust = snoise(p * 15.0);
    col += dust * 0.05;

    gl_FragColor = vec4(col, alpha);
}
`;

export class OrganismVisuals {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;

    constructor() {
        // Plane covering the potential area
        // We might need to move this plane with the organism or make it large enough?
        // Making it large fixed plane for now, centered at 0? 
        // No, efficiency: Plane should follow the organism center.
        // But shader expects world coords.
        // Let's make a reasonable sized plane and update its position to the blob centroid.

        const geometry = new THREE.PlaneGeometry(25, 25);
        geometry.rotateX(-Math.PI / 2);

        this.material = new THREE.ShaderMaterial({
            vertexShader: ORGANISM_VERTEX_SHADER,
            fragmentShader: ORGANISM_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uColor: { value: new THREE.Color(1, 0, 1) },
                uBlobs: { value: new Array(20).fill(0).map(() => new THREE.Vector3()) }, // Packed as vec3 array? No, ThreeJS handles vec3 array 
                uBlobCount: { value: 0 }
            },
            transparent: true,
            depthWrite: false, // Semi-transparent fuzz
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.renderOrder = 100; // Above floor
        this.mesh.frustumCulled = false; // Prevent culling if blob moves out of plane center (we will move plane though)
    }

    public update(nodes: { x: number, z: number, r: number }[], dt: number) {
        this.material.uniforms.uTime.value += dt;

        const count = Math.min(nodes.length, 20);
        this.material.uniforms.uBlobCount.value = count;

        // Calculate Centroid to move the mesh
        let cx = 0, cz = 0;

        const blobs = this.material.uniforms.uBlobs.value as THREE.Vector3[];
        for (let i = 0; i < count; i++) {
            blobs[i].set(nodes[i].x, nodes[i].z, nodes[i].r);
            cx += nodes[i].x;
            cz += nodes[i].z;
        }

        if (count > 0) {
            cx /= count;
            cz /= count;
            this.mesh.position.set(cx, 0.1, cz); // Center mesh on blob
        }
    }

    public setColor(color: THREE.Color) {
        this.material.uniforms.uColor.value.copy(color);
    }
}
