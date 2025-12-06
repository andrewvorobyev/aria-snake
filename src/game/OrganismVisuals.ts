import * as THREE from 'three';

export const ORGANISM_FRAGMENT_SHADER = `
varying vec3 vWorldPosition;
varying vec2 vUv;

uniform vec2 uPoints[20];
uniform int uPointCount;
uniform float uTime;
uniform vec3 uColor;

// --- Noise Function (Simplex 2D) ---
vec3 permute(vec3 x) { return mod(((x*34.0)+1.0)*x, 289.0); }

float snoise(vec2 v){
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
           -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
  + i.x + vec3(0.0, i1.x, 1.0 ));
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

float sdSegment(in vec2 p, in vec2 a, in vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    vec2 p = vWorldPosition.xz;
    float t = uTime * 1.5;

    // 1. Domain Warping (Jelly Wobble)
    // Displace space with noise to create organic irregularity
    float warp = snoise(p * 0.8 + t * 0.2);
    vec2 offset = vec2(
        snoise(p + vec2(t * 0.1, 0.0)),
        snoise(p + vec2(0.0, t * 0.15))
    ) * (0.15 + 0.05 * sin(t));
    
    vec2 distP = p + offset;

    // 2. Distance Field (Skeleton)
    float d = 1000.0;
    
    // Dynamic Radius
    // Breathe/Pulse
    float r = 0.55 + 0.03 * sin(t * 2.0 + p.x);

    if (uPointCount <= 1) {
        // Single Cell
        vec2 center = (uPointCount == 1) ? uPoints[0] : vec2(0.0);
        d = length(distP - center) - r;
    } else {
        // Worm Body
        for (int i = 0; i < 19; i++) {
            if (i >= uPointCount - 1) break;
            vec2 p1 = uPoints[i];
            vec2 p2 = uPoints[i+1];
            float seg = sdSegment(distP, p1, p2);
            d = min(d, seg);
        }
        d -= r;
    }

    // 3. Rendering
    float alpha = 1.0 - smoothstep(0.0, 0.04, d);
    if (alpha <= 0.01) discard;

    // Internal "Cytoplasm" Noise
    float cellNoise = snoise(p * 3.0 - t * 0.3);
    float detail = smoothstep(0.2, 0.8, cellNoise); // Veins/Organelles

    // Colors
    vec3 baseHsv = uColor; // Assume passed as RGB actually
    vec3 col = uColor;
    
    // Gradient / Shading
    col = mix(col, col * 0.6 + vec3(0.0, 0.1, 0.1), detail * 0.5);
    
    // Rim Light (Fresnel-like)
    // The closer to d=0 (edge), the brighter
    float rim = smoothstep(-0.3, 0.0, d);
    col += vec3(0.3, 0.5, 0.7) * rim * 0.6; // Blue rim glow
    
    // Core Glow
    float core = smoothstep(-r, -r * 0.2, d);
    col = mix(col, uColor * 1.5, (1.0 - core) * 0.3);

    gl_FragColor = vec4(col, alpha * 0.9);
}
`;

export const ORGANISM_VERTEX_SHADER = `
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

export class OrganismVisuals {
    public mesh: THREE.Mesh;
    private maxPoints = 20;

    constructor() {
        // Enlarge geometry to cover max area
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.ShaderMaterial({
            vertexShader: ORGANISM_VERTEX_SHADER,
            fragmentShader: ORGANISM_FRAGMENT_SHADER,
            uniforms: {
                // Fix: Use Array.from to create UNIQUE Vector2 instances
                uPoints: { value: Array.from({ length: 20 }, () => new THREE.Vector2(0, 0)) },
                uPointCount: { value: 0 },
                uTime: { value: 0 },
                uColor: { value: new THREE.Vector3(0.6, 0.0, 0.8) } // Deep Violet Default
            },
            transparent: true,
            depthWrite: false,
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
    }

    public setColor(color: THREE.Color) {
        if (this.mesh.material instanceof THREE.ShaderMaterial) {
            this.mesh.material.uniforms.uColor.value.set(color.r, color.g, color.b);
        }
    }

    public update(points: { x: number, z: number }[], dt: number) {
        if (!this.mesh.material || !(this.mesh.material instanceof THREE.ShaderMaterial)) return;

        const uniforms = this.mesh.material.uniforms;
        uniforms.uTime.value += dt;

        const count = Math.min(points.length, this.maxPoints);
        uniforms.uPointCount.value = count;

        // Debug
        // if (Math.random() < 0.05) console.log("Org Points:", count);

        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;

        for (let i = 0; i < count; i++) {
            uniforms.uPoints.value[i].set(points[i].x, points[i].z);

            minX = Math.min(minX, points[i].x);
            maxX = Math.max(maxX, points[i].x);
            minZ = Math.min(minZ, points[i].z);
            maxZ = Math.max(maxZ, points[i].z);
        }

        const padding = 2.0;
        const width = (maxX - minX) + padding * 2;
        const depth = (maxZ - minZ) + padding * 2;
        const centerX = (minX + maxX) / 2;
        const centerZ = (minZ + maxZ) / 2;

        this.mesh.position.set(centerX, 0.15, centerZ);
        this.mesh.scale.set(Math.max(1, width), 1.0, Math.max(1, depth));
    }
}
