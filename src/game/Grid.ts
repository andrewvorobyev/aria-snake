import * as THREE from 'three';
import { CONFIG } from '../constants';
import { FruitVisuals, FruitType } from './FruitVisuals';

const BACKGROUND_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPosition;
void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`;

const BACKGROUND_FRAGMENT_SHADER = `
uniform float uTime;
varying vec2 vUv;

// Simplex 2D noise
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

// Pseudo-random (Hash)
float rand(vec2 n) { 
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

void main() {
    vec2 uv = vUv;
    float time = uTime * 0.1;

    // --- 1. Background Gradient (Pleasant Fresh Green) ---
    vec3 bgA = vec3(0.1, 0.2, 0.15); // Fresh Emerald
    vec3 bgB = vec3(0.02, 0.08, 0.05); // Deep Forest
    vec3 col = mix(bgA, bgB, uv.y + 0.2 * sin(time * 0.5));

    // --- 2. Fluid Currents (Volumetric) ---
    float angle = -0.5;
    mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
    vec2 rotUV = rot * uv * 0.6; 
    
    // Domain Warping
    vec2 warp = vec2(
        snoise(rotUV * 1.5 + vec2(time * 0.2, time * 0.1)),
        snoise(rotUV * 1.5 + vec2(time * 0.15, -time * 0.2) + vec2(3.4, 1.2))
    );
    
    // Displaced noise
    float fluidNoise = snoise(rotUV + warp * 0.4 - vec2(time * 0.05, time * 0.1));
    float currents = smoothstep(-0.4, 1.0, fluidNoise);
    
    // Minty Light
    vec3 currentCol = vec3(0.5, 0.9, 0.6); 
    col += currents * currentCol * 0.12; 

    // --- 3. Drifting Pollen ---
    float dustTime = uTime * 0.03; 
    vec2 dustUV = uv * 6.0; 
    
    vec2 dustWarp = vec2(sin(dustUV.y * 2.0 + time), cos(dustUV.x * 2.0 + time * 0.8)) * 0.1;
    
    float n1 = snoise(dustUV + dustWarp + vec2(0.0, -dustTime)); 
    float speck1 = smoothstep(0.4, 0.9, n1); 
    
    float n2 = snoise(dustUV * 0.5 + dustWarp * 0.5 + vec2(dustTime * 0.5, dustTime));
    float speck2 = smoothstep(0.4, 0.9, n2);
    
    // Soft Cream Pollen
    vec3 dustCol = vec3(1.0, 1.0, 0.8);
    col += (speck1 * 0.15 + speck2 * 0.1) * dustCol;

    // --- 4. Noise / Grain ---
    float grain = rand(uv * 2.0 + vec2(uTime * 1.5)); 
    col += (grain - 0.5) * 0.08; 
    
    float detail = snoise(uv * 20.0 - uTime * 0.1);
    col += detail * 0.02; 

    // --- 5. Vignette ---
    float dist = distance(uv, vec2(0.5));
    col *= smoothstep(1.3, 0.2, dist * 0.8);

    gl_FragColor = vec4(col, 1.0);
}
`;

export const CellState = {
    EMPTY: 0,
    SNAKE: 1,
    FRUIT: 2,
    OBSTACLE: 3
} as const;

interface Obstacle {
    x: number;
    z: number;
    mesh: THREE.Mesh;
    ttl: number; // Time To Live
}

interface Fruit {
    x: number;
    z: number;
    mesh: THREE.Mesh;
    type: FruitType;
}

export class Grid {
    public mesh: THREE.Group;
    private width: number = 100; // Will be set on resize
    private depth: number = 100; // Will be set on resize
    private obstacles: Obstacle[] = [];
    private fruits: Fruit[] = [];

    private obstacleGeometry: THREE.BoxGeometry;
    private obstacleMaterial: THREE.MeshStandardMaterial;

    private bgMaterial: THREE.ShaderMaterial; // Store to update uniforms


    private occupiedCells: Set<string> = new Set();

    constructor(aspectRatio: number) {
        this.mesh = new THREE.Group();

        this.obstacleGeometry = new THREE.BoxGeometry(CONFIG.GRID.CELL_SIZE * 0.9, 1, CONFIG.GRID.CELL_SIZE * 0.9);
        this.obstacleMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.COLORS.OBSTACLE });

        // Initialize shader material
        this.bgMaterial = new THREE.ShaderMaterial({
            vertexShader: BACKGROUND_VERTEX_SHADER,
            fragmentShader: BACKGROUND_FRAGMENT_SHADER,
            uniforms: {
                uTime: { value: 0 }
            },
            side: THREE.DoubleSide
        });

        this.resize(aspectRatio);
    }

    public resize(aspectRatio: number) {
        this.depth = CONFIG.GRID.FIXED_SIDE;
        this.width = this.depth * aspectRatio; // Allow float width

        // Rebuild Grid Visuals
        while (this.mesh.children.length > 0) {
            this.mesh.remove(this.mesh.children[0]);
        }
        this.obstacles = [];
        this.fruits = [];
        this.occupiedCells.clear();

        // Background Plane
        const planeGeo = new THREE.PlaneGeometry(this.width, this.depth);
        // Use the shader material
        const plane = new THREE.Mesh(planeGeo, this.bgMaterial);
        plane.rotation.x = Math.PI / 2;
        plane.receiveShadow = true;
        this.mesh.add(plane);

        // this.createGridLines();
    }

    private createGridLines() {
        const material = new THREE.LineBasicMaterial({ color: CONFIG.COLORS.GRID_LINES });
        const points: THREE.Vector3[] = [];
        const halfW = this.width / 2;
        const halfD = this.depth / 2;

        const xLimit = halfW;
        for (let x = 0.5; x <= xLimit; x += 1.0) {
            points.push(new THREE.Vector3(x, 0, -halfD));
            points.push(new THREE.Vector3(x, 0, halfD));
            points.push(new THREE.Vector3(-x, 0, -halfD));
            points.push(new THREE.Vector3(-x, 0, halfD));
        }

        const zLimit = halfD;
        for (let z = 0.5; z <= zLimit; z += 1.0) {
            points.push(new THREE.Vector3(-halfW, 0, z));
            points.push(new THREE.Vector3(halfW, 0, z));
            points.push(new THREE.Vector3(-halfW, 0, -z));
            points.push(new THREE.Vector3(halfW, 0, -z));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lines = new THREE.LineSegments(geometry, material);
        this.mesh.add(lines);
    }

    public update(dt: number, snakePath: THREE.Vector3[]) {
        // Update shader time
        this.bgMaterial.uniforms.uTime.value += dt;

        // 1. Manage Obstacles
        const totalCells = (this.width / CONFIG.GRID.CELL_SIZE) * (this.depth / CONFIG.GRID.CELL_SIZE);
        const targetCount = Math.floor(totalCells * CONFIG.GRID.TARGET_OBSTACLE_DENSITY);

        // Decay existing
        for (let i = this.obstacles.length - 1; i >= 0; i--) {
            this.obstacles[i].ttl -= dt;
            if (this.obstacles[i].ttl <= 0) {
                this.removeObstacle(i);
            }
        }

        // Spawn new
        if (this.obstacles.length < targetCount) {
            this.spawnObstacle(snakePath);
        }

        // 2. Manage Fruit
        if (this.fruits.length < CONFIG.FRUIT.TARGET_COUNT) {
            this.spawnFruit(snakePath);
        }

        // Update Fruit Animations (Shader Time)
        this.fruits.forEach(f => {
            if (f.mesh.material instanceof THREE.ShaderMaterial) {
                f.mesh.material.uniforms.uTime.value += dt;
            }
        });
    }

    private spawnObstacle(snakePath: THREE.Vector3[]) {
        const pos = this.getRandomEmptyCell(snakePath, 5);
        if (pos) {
            const mesh = new THREE.Mesh(this.obstacleGeometry, this.obstacleMaterial);
            mesh.position.set(pos.x, 0.5, pos.z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.mesh.add(mesh);

            this.obstacles.push({
                x: pos.x,
                z: pos.z,
                mesh: mesh,
                ttl: Math.random() * 10 + 5
            });
            this.occupiedCells.add(`${Math.round(pos.x)},${Math.round(pos.z)}`);
        }
    }

    private removeObstacle(index: number) {
        const obs = this.obstacles[index];
        this.mesh.remove(obs.mesh);
        this.occupiedCells.delete(`${Math.round(obs.x)},${Math.round(obs.z)}`);
        this.obstacles.splice(index, 1);
    }

    private spawnFruit(snakePath: THREE.Vector3[]) {
        const sizeCells = CONFIG.FRUIT.SIZE_CELLS;
        // Use clearance based on size
        const pos = this.getRandomEmptyRegion(snakePath, 2 + sizeCells / 2, sizeCells);

        if (pos) {
            // Random Fruit Type
            const type = Math.floor(Math.random() * 4) as FruitType;
            const mesh = FruitVisuals.createFruitMesh(type);

            mesh.position.set(pos.x, 0, pos.z);

            // Scale to match config size
            const scale = sizeCells * CONFIG.GRID.CELL_SIZE * 0.8;
            mesh.scale.multiplyScalar(scale);

            this.mesh.add(mesh);
            this.fruits.push({ x: pos.x, z: pos.z, mesh, type });
        }
    }

    public isPositionBlocked(x: number, z: number, radius: number): boolean {
        // Wall
        const halfW = this.width / 2;
        const halfD = this.depth / 2;

        // Boundary check. Snake center must be within bounds minus radius? 
        // User said "move based on float". Usually center must stay inside or at least not go fully out.
        // Let's constrain center inside limits - radius.
        if (x < -halfW + radius || x > halfW - radius || z < -halfD + radius || z > halfD - radius) {
            return true;
        }

        // Obstacles
        // Obstacles are at integer coords (implicit). Actually my code stores them at float 'obs.x'.
        // But they are spawned at integer+0.5 coords. 
        // Size: ~0.9 (BoxGeometry).
        // Collision: Circle (x,z, radius) vs AABB (obs.x, obs.z, size).

        const obsHalfSize = (CONFIG.GRID.CELL_SIZE * 0.9) / 2;

        for (const obs of this.obstacles) {
            const closestX = Math.max(obs.x - obsHalfSize, Math.min(x, obs.x + obsHalfSize));
            const closestZ = Math.max(obs.z - obsHalfSize, Math.min(z, obs.z + obsHalfSize));

            const distanceX = x - closestX;
            const distanceZ = z - closestZ;

            const distanceSq = (distanceX * distanceX) + (distanceZ * distanceZ);
            if (distanceSq < (radius * radius)) {
                return true;
            }
        }
        return false;
    }

    public handleFruitCollection(x: number, z: number, radius: number): boolean {
        const fruitRadius = (CONFIG.GRID.CELL_SIZE * CONFIG.FRUIT.SIZE_CELLS) * 0.4;

        for (let i = this.fruits.length - 1; i >= 0; i--) {
            const f = this.fruits[i];
            const dist = Math.sqrt((x - f.x) ** 2 + (z - f.z) ** 2);

            if (dist < radius + fruitRadius) {
                // Remove fruit
                this.mesh.remove(f.mesh);
                this.fruits.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    private getRandomEmptyRegion(snakePath: THREE.Vector3[], bboxRadius: number, regionSizeCells: number): { x: number, z: number } | null {
        // Try N times to find a spot
        for (let i = 0; i < 30; i++) {
            const halfW = this.width / 2;
            const halfD = this.depth / 2;

            const maxX = Math.floor(halfW - 0.5 - (regionSizeCells - 1) / 2);
            const maxZ = Math.floor(halfD - 0.5 - (regionSizeCells - 1) / 2);

            // Random center
            const kx = Math.floor(Math.random() * (maxX * 2 + 1)) - maxX;
            const kz = Math.floor(Math.random() * (maxZ * 2 + 1)) - maxZ;

            const cx = kx;
            const cz = kz;

            // Check distance from snake BODY (Whole Path)
            let tooClose = false;
            // Iterate path with stride to performance
            for (let j = 0; j < snakePath.length; j += 4) {
                const p = snakePath[j];
                const d = Math.sqrt((cx - p.x) ** 2 + (cz - p.z) ** 2);
                if (d < bboxRadius) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            // Check occupation for entire region
            // We check if any cell in the 3x3 area is occupied
            // Region extends from cx - 1 to cx + 1 (if size 3)
            let occupied = false;
            const halfRegion = Math.floor(regionSizeCells / 2);

            for (let rx = -halfRegion; rx <= halfRegion; rx++) {
                for (let rz = -halfRegion; rz <= halfRegion; rz++) {
                    const checkX = cx + rx;
                    const checkZ = cz + rz;
                    const key = `${checkX},${checkZ}`;
                    if (this.occupiedCells.has(key)) {
                        occupied = true;
                        break;
                    }
                }
                if (occupied) break;
            }
            if (occupied) continue;

            // Check existing fruits (center to center distance)
            // Overlap if distance < (MySize + TheirSize) / 2
            const fruitSize = CONFIG.FRUIT.SIZE_CELLS;
            const minDistance = (regionSizeCells + fruitSize) / 2;

            if (this.fruits.some(f => Math.abs(f.x - cx) < minDistance && Math.abs(f.z - cz) < minDistance)) continue;

            return { x: cx, z: cz };
        }
        return null;
    }

    // Helper for single cell (kept for obstacles)
    private getRandomEmptyCell(snakePath: THREE.Vector3[], bboxRadius: number): { x: number, z: number } | null {
        return this.getRandomEmptyRegion(snakePath, bboxRadius, 1);
    }
}
