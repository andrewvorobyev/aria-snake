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

void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;
    
    // Sample entity trails
    vec4 entityMask = sampleMaskBlurred(uv, 2.0);
    float snakeTrail = smoothstep(0.0, 0.3, entityMask.r);
    float orgTrail = smoothstep(0.0, 0.3, entityMask.g);
    float totalTrail = snakeTrail + orgTrail;
    
    // UV distortion from trails
    vec2 distortedUV = uv;
    float dx = uMaskTexelSize.x * 4.0;
    float dy = uMaskTexelSize.y * 4.0;
    float presL = texture2D(uEntityMask, uv - vec2(dx, 0.0)).r + texture2D(uEntityMask, uv - vec2(dx, 0.0)).g;
    float presR = texture2D(uEntityMask, uv + vec2(dx, 0.0)).r + texture2D(uEntityMask, uv + vec2(dx, 0.0)).g;
    float presD = texture2D(uEntityMask, uv - vec2(0.0, dy)).r + texture2D(uEntityMask, uv - vec2(0.0, dy)).g;
    float presU = texture2D(uEntityMask, uv + vec2(0.0, dy)).r + texture2D(uEntityMask, uv + vec2(0.0, dy)).g;
    vec2 gradient = vec2(presR - presL, presU - presD);
    distortedUV += gradient * 0.01;
    
    // Lens distortion
    float r2 = dot(centered, centered);
    distortedUV += centered * (r2 * 0.04);
    
    // Base color gradient
    float baseHue = 0.25;
    float hueVariation = sin(uv.x * 3.14159) * 0.08 + cos(uv.y * 2.0) * 0.05;
    float posHue = baseHue + hueVariation + snoise(uv * 2.0) * 0.05;
    posHue += (uv.x + uv.y - 1.0) * 0.06;
    
    // Trails shift hue
    posHue += snakeTrail * 0.04;
    posHue -= orgTrail * 0.02;
    
    // Organic texture
    vec2 warpedUV = warp(distortedUV * 3.0, uTime);
    float noise = fbm(warpedUV);
    
    float saturation = 0.35 + noise * 0.15;
    float brightness = 0.75 + noise * 0.15;
    brightness += snakeTrail * 0.06;
    brightness += orgTrail * 0.04;
    
    float centerGlow = 1.0 - length(centered) * 0.3;
    brightness *= centerGlow;
    
    vec3 baseColor = hsv2rgb(vec3(posHue, saturation, brightness));
    
    // Caustics
    float caustic = snoise(warpedUV * 4.0 + uTime * 0.1);
    baseColor += vec3(0.06, 0.08, 0.03) * smoothstep(-0.3, 0.8, caustic) * 0.5;
    
    // Grain
    float grain = snoise(uv * 50.0 + uTime * 0.5);
    baseColor += grain * 0.01;
    
    // Vignette
    float dist = length(centered);
    float vignette = smoothstep(uVignetteParams.x, uVignetteParams.y, dist);
    vec3 finalColor = mix(baseColor, baseColor * uVignetteParams.z, vignette);
    
    // Trail glows
    finalColor += vec3(0.06, 0.09, 0.02) * snakeTrail;
    finalColor += vec3(0.02, 0.06, 0.04) * orgTrail;
    
    finalColor += vec3(0.03, 0.04, 0.01);
    
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
