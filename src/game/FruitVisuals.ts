
import * as THREE from 'three';

export const FruitType = {
    KIWI: 0,
    STRAWBERRY: 1
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
uniform sampler2D uMap;
uniform bool uHasMap;

// --- Noise ---
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
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

float fbm(vec2 p) {
    float f = 0.0;
    float w = 0.5;
    for (int i = 0; i < 4; i++) {
        f += w * snoise(p);
        p *= 2.0;
        w *= 0.5;
    }
    return f;
}

void main() {
    vec2 p = vUv * 2.0 - 1.0;
    p *= 1.1;

    // Animation: Bobbing & Wiggle (Restored)
    vec2 wiggle = vec2(sin(uTime * 3.0 + p.y*2.0), cos(uTime * 2.5 + p.x*3.0)) * 0.03;
    p += wiggle; 
    
    // TEXTURE MODE
    if (uHasMap) {
        vec2 uv = vUv;
        uv += wiggle * 0.5; // Flowy UVs
        
        vec4 tex = texture2D(uMap, uv);
        
        // Enhance Color (Contrast + Brightness)
        vec3 finalColor = pow(tex.rgb, vec3(1.2)) * 1.5;
        
        // --- ADVANCED NOISE ---
        float n = fbm(p * 4.0 + uTime * 0.5); // Structural Noise
        float grain = snoise(uv * 40.0 + uTime * 10.0); // High freq Grit
        
        // Apply Noise Mix
        vec3 noiseTint = uColor * n * 0.5; // Strong tinted structure
        finalColor += noiseTint;
        finalColor += vec3(grain) * 0.15; // Grit overlay
        
        float alpha = tex.a;
        if (alpha < 0.1) discard; // Keep clean edge
        
        gl_FragColor = vec4(finalColor, alpha);
    } else {
        // Fallback placeholder (Circle)
        float d = length(p) - 0.4;
        if (d > 0.0) discard;
        gl_FragColor = vec4(uColor, 1.0);
    }
}
`;

export class FruitVisuals {
    private static texLoader = new THREE.TextureLoader();
    private static textures: Record<string, THREE.Texture> = {};

    private static getTexture(path: string): THREE.Texture {
        if (!this.textures[path]) {
            this.textures[path] = this.texLoader.load(path);
        }
        return this.textures[path];
    }

    public static createFruitMesh(type: FruitType): THREE.Mesh {
        const geometry = new THREE.PlaneGeometry(1, 1);
        geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

        let color: THREE.Color;
        let scale = 1.0; // 1:1 match with physics diameter
        let texture: THREE.Texture | null = null;

        switch (type) {
            case FruitType.KIWI:
                color = new THREE.Color(0x88ff44);
                texture = this.getTexture('/assets/ready/kiwi.png');
                break;
            case FruitType.STRAWBERRY:
                color = new THREE.Color(0xff2244);
                texture = this.getTexture('/assets/ready/strawberry.png');
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
                uColor: { value: new THREE.Vector3(color.r, color.g, color.b) },
                uMap: { value: texture },
                uHasMap: { value: !!texture }
            },
            transparent: true,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.scale.multiplyScalar(scale);
        mesh.position.y = 0.1; // Just above ground

        return mesh;
    }
}
