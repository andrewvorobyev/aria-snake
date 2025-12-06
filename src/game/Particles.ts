import * as THREE from 'three';
import { CONFIG } from '../constants';

const VERTEX_SHADER = `
attribute float aLife;
attribute float aMaxLife;
attribute float aHue;
attribute float aSize;
attribute float aTrailIndex;

varying float vLife;
varying float vMaxLife;
varying float vHue;
varying float vTrailIndex;

void main() {
    vLife = aLife;
    vMaxLife = aMaxLife;
    vHue = aHue;
    vTrailIndex = aTrailIndex;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    float lifeRatio = aLife / aMaxLife;
    
    // Trail particles get smaller
    float trailFade = 1.0 - vTrailIndex * 0.15;
    
    // Size animation: burst big, then shrink
    float sizeAnim = mix(1.5, 0.3, lifeRatio);
    
    gl_PointSize = aSize * sizeAnim * trailFade * (300.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
varying float vLife;
varying float vMaxLife;
varying float vHue;
varying float vTrailIndex;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    if (dist > 0.5) discard;
    
    float lifeRatio = vLife / vMaxLife;
    
    // Rainbow hue cycling
    float hue = fract(vHue + vLife * 0.3);
    
    // Super vibrant saturated colors
    vec3 color = hsv2rgb(vec3(hue, 0.95, 1.0));
    
    // Brightness boost
    color *= 1.5;
    
    // Glow effect - soft edges
    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
    
    // Bright core
    float core = smoothstep(0.25, 0.0, dist);
    vec3 coreColor = vec3(1.0); // White hot center
    vec3 finalColor = mix(color, coreColor, core * 0.6);
    
    // Trail particles fade
    float trailAlpha = 1.0 - vTrailIndex * 0.13;
    
    // Fade over lifetime
    float lifeFade = 1.0 - pow(lifeRatio, 0.7);
    
    // Sparkle
    float spark = sin(vLife * 50.0 + vHue * 40.0) * 0.5 + 0.5;
    finalColor += vec3(spark * 0.4 * lifeFade);
    
    float alpha = glow * lifeFade * trailAlpha;
    
    // Output vivid color (not premultiplied)
    gl_FragColor = vec4(finalColor, alpha);
}
`;

const TRAIL_LENGTH = 6;

interface TrailPoint {
    x: number;
    y: number;
    z: number;
}

interface ParticleData {
    position: THREE.Vector3;
    velocity: THREE.Vector3;
    life: number;
    maxLife: number;
    hue: number;
    size: number;
    active: boolean;
    trail: TrailPoint[];
    initialSpeed: number;
}

export class ParticleSystem {
    public group: THREE.Group;
    private particles: ParticleData[] = [];
    private geometry: THREE.BufferGeometry;
    private material: THREE.ShaderMaterial;
    private points: THREE.Points;

    private maxParticles: number;
    private totalPoints: number;

    // Buffers
    private positions: Float32Array;
    private lifes: Float32Array;
    private maxLifes: Float32Array;
    private hues: Float32Array;
    private sizes: Float32Array;
    private trailIndices: Float32Array;

    constructor() {
        this.group = new THREE.Group();
        this.maxParticles = CONFIG.PARTICLES.MAX_COUNT;
        this.totalPoints = this.maxParticles * TRAIL_LENGTH;

        // Initialize buffers (particles * trail points)
        this.positions = new Float32Array(this.totalPoints * 3);
        this.lifes = new Float32Array(this.totalPoints);
        this.maxLifes = new Float32Array(this.totalPoints);
        this.hues = new Float32Array(this.totalPoints);
        this.sizes = new Float32Array(this.totalPoints);
        this.trailIndices = new Float32Array(this.totalPoints);

        // Initialize particle data
        for (let i = 0; i < this.maxParticles; i++) {
            const trail: TrailPoint[] = [];
            for (let t = 0; t < TRAIL_LENGTH; t++) {
                trail.push({ x: 0, y: -100, z: 0 });
            }

            this.particles.push({
                position: new THREE.Vector3(),
                velocity: new THREE.Vector3(),
                life: 0,
                maxLife: 1,
                hue: 0,
                size: 1,
                active: false,
                trail,
                initialSpeed: 0
            });

            // Initialize all trail points offscreen
            for (let t = 0; t < TRAIL_LENGTH; t++) {
                const idx = i * TRAIL_LENGTH + t;
                this.positions[idx * 3 + 1] = -100;
                this.trailIndices[idx] = t;
            }
        }

        // Create geometry
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lifes, 1));
        this.geometry.setAttribute('aMaxLife', new THREE.BufferAttribute(this.maxLifes, 1));
        this.geometry.setAttribute('aHue', new THREE.BufferAttribute(this.hues, 1));
        this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
        this.geometry.setAttribute('aTrailIndex', new THREE.BufferAttribute(this.trailIndices, 1));

        // Create material
        this.material = new THREE.ShaderMaterial({
            vertexShader: VERTEX_SHADER,
            fragmentShader: FRAGMENT_SHADER,
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending
        });

        // Create points
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.group.add(this.points);
    }

    /**
     * Spawn an explosive burst of particles with trails
     */
    public spawnBurst(x: number, z: number, count: number = CONFIG.PARTICLES.BURST_COUNT) {
        let spawned = 0;

        for (let i = 0; i < this.maxParticles && spawned < count; i++) {
            const p = this.particles[i];
            if (p.active) continue;

            // Activate particle
            p.active = true;
            p.position.set(x, 0.5, z);

            // Initialize trail at spawn point
            for (let t = 0; t < TRAIL_LENGTH; t++) {
                p.trail[t].x = x;
                p.trail[t].y = 0.5;
                p.trail[t].z = z;
            }

            // Explosive burst - very fast initial velocity
            const angle = (spawned / count) * Math.PI * 2 + Math.random() * 0.3;
            const speedVariation = Math.random();
            const speed = CONFIG.PARTICLES.SPEED.MIN + speedVariation * (CONFIG.PARTICLES.SPEED.MAX - CONFIG.PARTICLES.SPEED.MIN);
            const upSpeed = CONFIG.PARTICLES.UP_SPEED.MIN + Math.random() * (CONFIG.PARTICLES.UP_SPEED.MAX - CONFIG.PARTICLES.UP_SPEED.MIN);

            // Add some random spread
            const spreadAngle = (Math.random() - 0.5) * 0.5;

            p.velocity.set(
                Math.cos(angle + spreadAngle) * speed * 1.5, // Extra burst power
                upSpeed * 1.3,
                Math.sin(angle + spreadAngle) * speed * 1.5
            );

            p.initialSpeed = p.velocity.length();
            p.life = 0;
            p.maxLife = CONFIG.PARTICLES.LIFE.MIN + Math.random() * (CONFIG.PARTICLES.LIFE.MAX - CONFIG.PARTICLES.LIFE.MIN);
            p.hue = spawned / count;
            p.size = CONFIG.PARTICLES.SIZE.MIN + Math.random() * (CONFIG.PARTICLES.SIZE.MAX - CONFIG.PARTICLES.SIZE.MIN);

            spawned++;
        }
    }

    /**
     * Update particle physics with trails
     */
    public update(dt: number) {
        const gravity = CONFIG.PARTICLES.GRAVITY;

        for (let i = 0; i < this.maxParticles; i++) {
            const p = this.particles[i];

            if (!p.active) {
                // Keep all trail points offscreen
                for (let t = 0; t < TRAIL_LENGTH; t++) {
                    const idx = i * TRAIL_LENGTH + t;
                    this.positions[idx * 3 + 1] = -100;
                }
                continue;
            }

            // Update trail - shift positions back
            for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
                p.trail[t].x = p.trail[t - 1].x;
                p.trail[t].y = p.trail[t - 1].y;
                p.trail[t].z = p.trail[t - 1].z;
            }
            p.trail[0].x = p.position.x;
            p.trail[0].y = p.position.y;
            p.trail[0].z = p.position.z;

            // Physics with air resistance (slows down fast)
            const lifeRatio = p.life / p.maxLife;
            const airResistance = 0.92 - lifeRatio * 0.1; // More drag as it ages

            p.velocity.y += gravity * dt;
            p.velocity.multiplyScalar(Math.pow(airResistance, dt * 60)); // Frame-rate independent drag
            p.position.add(p.velocity.clone().multiplyScalar(dt));

            // Ground collision with bounce
            if (p.position.y < 0.15) {
                p.position.y = 0.15;
                p.velocity.y *= -0.3;
                p.velocity.x *= 0.6;
                p.velocity.z *= 0.6;
            }

            // Update life
            p.life += dt;

            // Update all trail point buffers
            for (let t = 0; t < TRAIL_LENGTH; t++) {
                const idx = i * TRAIL_LENGTH + t;

                this.positions[idx * 3] = p.trail[t].x;
                this.positions[idx * 3 + 1] = p.trail[t].y;
                this.positions[idx * 3 + 2] = p.trail[t].z;
                this.lifes[idx] = p.life;
                this.maxLifes[idx] = p.maxLife;
                this.hues[idx] = p.hue;
                this.sizes[idx] = p.size;
            }

            // Deactivate dead particles
            if (p.life >= p.maxLife) {
                p.active = false;
                for (let t = 0; t < TRAIL_LENGTH; t++) {
                    const idx = i * TRAIL_LENGTH + t;
                    this.positions[idx * 3 + 1] = -100;
                }
            }
        }

        // Flag buffers for update
        this.geometry.attributes.position.needsUpdate = true;
        (this.geometry.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.aMaxLife as THREE.BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.aHue as THREE.BufferAttribute).needsUpdate = true;
        (this.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    }

    public dispose() {
        this.geometry.dispose();
        this.material.dispose();
    }
}
