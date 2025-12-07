import * as THREE from 'three';
import { CONFIG } from '../constants';

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
uniform float uTime;
uniform vec3 uVignetteParams;
uniform sampler2D uEntityMask;
uniform vec2 uMaskTexelSize;
varying vec2 vUv;

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
    vec2 i = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);
    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;
    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
    m = m * m * m * m;
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

float fbm(vec2 st) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
        value += amplitude * snoise(st);
        st *= 2.1;
        amplitude *= 0.5;
    }
    return value;
}

vec2 warp(vec2 p, float time) {
    float n1 = snoise(p * 2.0 + time * 0.1);
    float n2 = snoise(p * 2.0 + vec2(5.2, 1.3) + time * 0.08);
    return p + vec2(n1, n2) * 0.3;
}

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

vec4 sampleMaskBlurred(vec2 uv, float radius) {
    vec4 sum = vec4(0.0);
    float totalWeight = 0.0;
    for (int i = -2; i <= 2; i++) {
        for (int j = -2; j <= 2; j++) {
            vec2 offset = vec2(float(i), float(j)) * uMaskTexelSize * radius;
            float weight = exp(-float(i*i + j*j) / 4.0);
            sum += texture2D(uEntityMask, uv + offset) * weight;
            totalWeight += weight;
        }
    }
    return sum / totalWeight;
}

// Voronoi for stone cracks
float voronoi(vec2 p) {
    vec2 i_st = floor(p);
    vec2 f_st = fract(p);
    float m_dist = 1.0;
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 neighbor = vec2(float(x), float(y));
            vec2 cellId = i_st + neighbor;
            float rx = fract(sin(dot(cellId, vec2(127.1, 311.7))) * 43758.5453);
            float ry = fract(sin(dot(cellId, vec2(269.5, 183.3))) * 43758.5453);
            vec2 point = vec2(rx, ry);
            vec2 diff = neighbor + point - f_st;
            m_dist = min(m_dist, dot(diff, diff));
        }
    }
    return sqrt(m_dist);
}

void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    
    // Sample entity trails (slimy traces)
    vec4 entityMask = sampleMaskBlurred(uv, 3.0);
    float snakeTrail = smoothstep(0.0, 0.2, entityMask.r);
    float orgTrail = smoothstep(0.0, 0.2, entityMask.g);
    float totalTrail = min(snakeTrail + orgTrail, 1.0);
    
    // Lens distortion
    float r2 = dot(centered, centered);
    vec2 distortedUV = uv + centered * (r2 * 0.03);
    
    // === STONE/ORGANIC FLOOR TEXTURE ===
    
    // Large scale stone pattern (static - no animation)
    float stoneNoise = fbm(distortedUV * 4.0);
    
    // Voronoi cracks
    float cracks = voronoi(distortedUV * 8.0);
    float crackLines = 1.0 - smoothstep(0.0, 0.08, cracks); // Dark cracks
    float crackEdge = smoothstep(0.08, 0.2, cracks); // Crack edge highlight
    
    // Secondary detail noise
    float detail = fbm(distortedUV * 12.0);
    
    // === YELLOW/AMBER COLOR PALETTE ===
    // Base yellow-amber stone color
    vec3 stoneLight = vec3(0.85, 0.75, 0.45);  // Light amber
    vec3 stoneMid = vec3(0.70, 0.55, 0.30);    // Medium amber
    vec3 stoneDark = vec3(0.45, 0.35, 0.20);   // Dark amber/brown
    vec3 crackColor = vec3(0.25, 0.18, 0.10);  // Very dark brown for cracks
    
    // Mix stone colors based on noise
    vec3 baseStone = mix(stoneMid, stoneLight, stoneNoise * 0.5 + 0.3);
    baseStone = mix(baseStone, stoneDark, smoothstep(0.3, 0.7, detail) * 0.3);
    
    // Add crack darkness
    baseStone = mix(baseStone, crackColor, crackLines * 0.8);
    
    // Subtle highlight on crack edges
    baseStone += vec3(0.08, 0.06, 0.02) * crackEdge * 0.3;
    
    // Very subtle variation across screen
    float screenVar = sin(uv.x * 2.0) * cos(uv.y * 1.5) * 0.05;
    baseStone *= 1.0 + screenVar;
    
    // Fine grain texture (static)
    float grain = snoise(distortedUV * 60.0);
    baseStone += grain * 0.02;
    
    // Center slightly brighter
    float centerGlow = 1.0 - length(centered) * 0.15;
    baseStone *= centerGlow;
    
    // === SLIMY TRAILS ON TOP ===
    // Snake slime - bright yellow-green, shiny
    vec3 snakeSlime = vec3(0.75, 0.85, 0.25); // Yellow-green slime
    float slimeSpec = smoothstep(0.3, 0.8, snakeTrail); // Shiny highlight
    
    // Organism slime - slightly different tint
    vec3 orgSlime = vec3(0.65, 0.80, 0.35); // Slightly greener
    
    // Apply slime trails
    vec3 finalColor = baseStone;
    
    // Slime darkens stone slightly where it is, then adds shine
    finalColor = mix(finalColor, finalColor * 0.85, totalTrail * 0.3);
    
    // Add slime color/shine
    finalColor += snakeSlime * snakeTrail * 0.25;
    finalColor += orgSlime * orgTrail * 0.2;
    
    // Slime reflection/shine
    float shine = snoise(distortedUV * 15.0 + vec2(uTime * 0.02, 0.0));
    finalColor += vec3(0.1, 0.12, 0.04) * totalTrail * smoothstep(0.3, 0.8, shine);
    
    // Vignette
    float dist = length(centered);
    float vignette = smoothstep(uVignetteParams.x, uVignetteParams.y, dist);
    finalColor = mix(finalColor, finalColor * uVignetteParams.z, vignette);
    
    // Warm ambient
    finalColor += vec3(0.02, 0.015, 0.005);
    
    gl_FragColor = vec4(finalColor, 1.0);
}
`;

export class Background {
    public mesh: THREE.Mesh;
    private material: THREE.ShaderMaterial;

    // Single render target for trails (no ping-pong, just fade in shader)
    private trailTarget: THREE.WebGLRenderTarget;
    private trailScene: THREE.Scene;
    private trailCamera: THREE.OrthographicCamera;

    // Reusable circle for rendering entities
    private circleGeometry: THREE.CircleGeometry;
    private snakeMaterial: THREE.MeshBasicMaterial;
    private orgMaterial: THREE.MeshBasicMaterial;

    // Fade quad
    private fadeQuad: THREE.Mesh;

    private readonly TRAIL_SIZE = 256;

    constructor() {
        const geometry = new THREE.PlaneGeometry(2, 2);

        this.trailTarget = new THREE.WebGLRenderTarget(this.TRAIL_SIZE, this.TRAIL_SIZE, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        });

        this.trailScene = new THREE.Scene();

        this.trailCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
        this.trailCamera.position.set(0, 100, 0);
        this.trailCamera.lookAt(0, 0, 0);

        // Circle for entities
        this.circleGeometry = new THREE.CircleGeometry(1, 16);
        this.circleGeometry.rotateX(-Math.PI / 2);

        this.snakeMaterial = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.15,
            depthWrite: false
        });

        this.orgMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.12,
            depthWrite: false
        });

        // Fade quad - draws previous frame slightly darker
        const fadeGeo = new THREE.PlaneGeometry(2, 2);
        const fadeMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.03, // 3% fade per frame
            depthWrite: false
        });
        this.fadeQuad = new THREE.Mesh(fadeGeo, fadeMat);
        this.fadeQuad.position.y = 99; // Just below camera
        this.fadeQuad.rotation.x = -Math.PI / 2;
        this.fadeQuad.scale.set(100, 100, 1);

        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 },
                uVignetteParams: {
                    value: new THREE.Vector3(
                        CONFIG.VIGNETTE.RADIUS_START,
                        CONFIG.VIGNETTE.RADIUS_END,
                        CONFIG.VIGNETTE.DARKNESS
                    )
                },
                uEntityMask: { value: this.trailTarget.texture },
                uMaskTexelSize: { value: new THREE.Vector2(1.0 / this.TRAIL_SIZE, 1.0 / this.TRAIL_SIZE) }
            },
            depthWrite: false,
            depthTest: false
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = -1;
    }

    public update(dt: number) {
        this.material.uniforms.uTime.value += dt;
    }

    /**
     * Render entity trails
     */
    public renderTrails(
        renderer: THREE.WebGLRenderer,
        snakePath: THREE.Vector3[],
        organismPositions: { x: number, z: number, radius: number }[],
        worldBounds: { width: number, depth: number }
    ) {
        const hw = worldBounds.width / 2;
        const hd = worldBounds.depth / 2;
        this.trailCamera.left = -hw;
        this.trailCamera.right = hw;
        this.trailCamera.top = hd;
        this.trailCamera.bottom = -hd;
        this.trailCamera.updateProjectionMatrix();
        this.fadeQuad.scale.set(worldBounds.width, worldBounds.depth, 1);

        // Clear scene
        while (this.trailScene.children.length > 0) {
            this.trailScene.remove(this.trailScene.children[0]);
        }

        // Add fade quad first (darkens previous frame)
        this.trailScene.add(this.fadeQuad);

        // Add snake circles
        const snakeRadius = CONFIG.SNAKE.CIRCLE_RADIUS * 1.5;
        for (let i = 0; i < snakePath.length; i += 5) {
            const p = snakePath[i];
            const circle = new THREE.Mesh(this.circleGeometry, this.snakeMaterial);
            circle.position.set(p.x, 0, p.z);
            circle.scale.setScalar(snakeRadius);
            this.trailScene.add(circle);
        }

        // Add organism circles
        for (const org of organismPositions) {
            const circle = new THREE.Mesh(this.circleGeometry, this.orgMaterial);
            circle.position.set(org.x, 0, org.z);
            circle.scale.setScalar(org.radius * 2);
            this.trailScene.add(circle);
        }

        // Render additively to existing texture
        renderer.setRenderTarget(this.trailTarget);
        renderer.autoClear = false;
        renderer.render(this.trailScene, this.trailCamera);
        renderer.autoClear = true;
        renderer.setRenderTarget(null);
    }

    public dispose() {
        this.trailTarget.dispose();
        this.circleGeometry.dispose();
        this.snakeMaterial.dispose();
        this.orgMaterial.dispose();
    }
}
