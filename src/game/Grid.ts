import * as THREE from 'three';
import { CONFIG } from '../constants';
import { FruitVisuals, FruitType } from './FruitVisuals';
import { OrganismVisuals } from './OrganismVisuals';

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
    vec3 bgA = vec3(0.6, 0.9, 0.7); // Light Mint
    vec3 bgB = vec3(0.4, 0.7, 0.5); // Soft Green
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
    vec3 currentCol = vec3(0.8, 1.0, 0.9); 
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
    vec3 dustCol = vec3(1.0, 1.0, 0.6);
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



interface Organism {
    segments: { x: number, z: number }[];
    direction: { x: number, z: number };
    visuals: OrganismVisuals;
    moveTimer: number;
    moveInterval: number;
    id: number;
    appearing: boolean;
    vanishing: boolean;
    scale: number;
    color?: THREE.Color;
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

    private organisms: Organism[] = [];
    private fruits: Fruit[] = [];
    private nextOrganismId = 0;


    private bgMaterial: THREE.ShaderMaterial; // Store to update uniforms


    private occupiedCells: Set<string> = new Set();

    constructor(aspectRatio: number) {
        this.mesh = new THREE.Group();

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
        this.organisms = [];
        this.nextOrganismId = 0;
        this.fruits = [];
        this.occupiedCells.clear();

        // Background Plane
        const planeGeo = new THREE.PlaneGeometry(this.width, this.depth);
        // Use the shader material
        const plane = new THREE.Mesh(planeGeo, this.bgMaterial);
        plane.rotation.x = Math.PI / 2;
        plane.receiveShadow = true;
        this.mesh.add(plane);

        if (this.showDebug) {
            this.createDebugMesh();
        }
    }



    public update(dt: number, snakePath: THREE.Vector3[]) {
        // Update shader time
        this.bgMaterial.uniforms.uTime.value += dt;

        // 1. Manage Obstacles
        // 1. Manage Organisms (Dynamic Enemies)
        const targetCount = 6; // Max organisms

        // Spawn new
        if (this.organisms.length < targetCount) {
            this.spawnOrganism(snakePath);
        }

        // Update Organisms
        for (let i = this.organisms.length - 1; i >= 0; i--) {
            const org = this.organisms[i];

            // Movement Logic
            org.moveTimer += dt;
            if (org.moveTimer > org.moveInterval) {
                org.moveTimer = 0;

                // Determine Move
                // 30% chance to change direction even if not blocked (Chaotic)
                if (Math.random() < 0.3) {
                    this.pickNewDirection(org);
                }

                let head = org.segments[0];
                let nextX = head.x + org.direction.x;
                let nextZ = head.z + org.direction.z;

                // Validate Move
                if (!this.isValidMove(nextX, nextZ, snakePath)) {
                    // Try to pick new direction
                    this.pickNewDirection(org);
                    // Try again
                    nextX = head.x + org.direction.x;
                    nextZ = head.z + org.direction.z;
                }

                if (this.isValidMove(nextX, nextZ, snakePath)) {
                    // Move
                    // Add Head
                    org.segments.unshift({ x: nextX, z: nextZ });
                    this.occupiedCells.add(`${nextX},${nextZ}`);

                    // Remove Tail (Max Length 5)
                    if (org.segments.length > 5) {
                        const tail = org.segments.pop()!;
                        this.occupiedCells.delete(`${tail.x},${tail.z}`);
                    }
                }
            }

            // Update Visuals
            org.visuals.update(org.segments, dt);
        }

        // 2. Manage Fruit
        if (this.fruits.length < CONFIG.FRUIT.TARGET_COUNT) {
            this.spawnFruit(snakePath);
        }

        // Update Fruit Animations (Shader Time + Wiggle)
        this.fruits.forEach(f => {
            if (f.mesh.material instanceof THREE.ShaderMaterial) {
                const t = f.mesh.material.uniforms.uTime.value += dt;
                // Bacteria wobble
                const seed = f.x * 12.34 + f.z * 56.78;
                f.mesh.rotation.y = Math.sin(t * 2.0 + seed) * 0.15;
            }
        });

        this.updateDebug(snakePath);
    }

    private spawnOrganism(snakePath: THREE.Vector3[]) {
        // Enforce integer grid coordinates
        // Width/Depth might be floats due to Aspect Ratio
        const gridW = Math.floor(this.width);
        const gridD = Math.floor(this.depth);

        for (let attempt = 0; attempt < 50; attempt++) {
            // Random Integer Coordinate within [-W/2 + 2, W/2 - 2]
            const kx = Math.floor(Math.random() * (gridW - 4)) - Math.floor(gridW / 2) + 2;
            const kz = Math.floor(Math.random() * (gridD - 4)) - Math.floor(gridD / 2) + 2;

            if (this.occupiedCells.has(`${kx},${kz}`)) continue;
            // Snake Distance Check
            if (snakePath.length > 0) {
                const dx = kx - snakePath[0].x;
                const dz = kz - snakePath[0].z;
                if (Math.sqrt(dx * dx + dz * dz) < 8) continue; // Reduced from 15 to 8
            }
            if (this.occupiedCells.has(`${kx},${kz}`)) continue;

            const tempSegments = [{ x: kx, z: kz }];

            // Commit immediately (Start at length 1 and grow)
            this.occupiedCells.add(`${kx},${kz}`);

            const visuals = new OrganismVisuals();
            visuals.update(tempSegments, 0);
            this.mesh.add(visuals.mesh);

            this.organisms.push({
                id: this.nextOrganismId++,
                segments: tempSegments,
                direction: { x: 0, z: 0 },
                moveTimer: 0,
                moveInterval: 0.15 + Math.random() * 0.2,
                visuals: visuals,
                appearing: true,
                vanishing: false,
                scale: 0.0,
            });

            this.pickNewDirection(this.organisms[this.organisms.length - 1]);
            // console.log(`[Grid] Spawned Organism ID ${this.organisms[this.organisms.length-1].id} at ${kx},${kz}`);
            return;
        }
        console.warn("[Grid] Failed to spawn organism of sufficient length after 50 attempts.");
    }

    private pickNewDirection(org: Organism) {
        const dirs = [
            { x: 1, z: 0 }, { x: -1, z: 0 },
            { x: 0, z: 1 }, { x: 0, z: -1 }
        ];
        // Bias towards current direction (Inertia)
        if (Math.random() < 0.7 && (org.direction.x !== 0 || org.direction.z !== 0)) {
            // Keep going
            return;
        }
        org.direction = dirs[Math.floor(Math.random() * dirs.length)];
    }

    private isValidMove(x: number, z: number, snakePath: THREE.Vector3[]): boolean {
        // Bounds
        const halfW = this.width / 2;
        const halfD = this.depth / 2;
        // Padding from wall
        if (x <= -halfW + 1 || x >= halfW - 1 || z <= -halfD + 1 || z >= halfD - 1) return false;

        // Occupied
        if (this.occupiedCells.has(`${x},${z}`)) return false;

        // Snake Path Check (Collision)
        for (const sp of snakePath) {
            const dx = Math.abs(sp.x - x);
            const dz = Math.abs(sp.z - z);
            if (dx < 0.8 && dz < 0.8) return false;
        }

        // Fruits
        for (const f of this.fruits) {
            if (Math.round(f.x) === x && Math.round(f.z) === z) return false;
        }

        return true;
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
        // Bounds check (World is centered at 0,0)
        const halfW = this.width / 2;
        const halfD = this.depth / 2;

        if (x < -halfW + radius || x > halfW - radius || z < -halfD + radius || z > halfD - radius) {
            return true;
        }

        // Check occupied cells (Organisms)
        // Widen search to ensure fast moving snake doesn't skip (Paranoid padding)
        const padding = 1.0;
        const minIX = Math.floor(x - radius - padding);
        const maxIX = Math.ceil(x + radius + padding);
        const minIZ = Math.floor(z - radius - padding);
        const maxIZ = Math.ceil(z + radius + padding);

        for (let ix = minIX; ix <= maxIX; ix++) {
            for (let iz = minIZ; iz <= maxIZ; iz++) {
                if (this.occupiedCells.has(`${ix},${iz}`)) {
                    // Box-Circle collision
                    const cellR = 0.45;
                    const closestX = Math.max(ix - cellR, Math.min(x, ix + cellR));
                    const closestZ = Math.max(iz - cellR, Math.min(z, iz + cellR));

                    const dx = x - closestX;
                    const dz = z - closestZ;

                    if ((dx * dx + dz * dz) < (radius * radius)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    public handleFruitCollection(x: number, z: number, radius: number): boolean {
        const fruitRadius = (CONFIG.GRID.CELL_SIZE * CONFIG.FRUIT.SIZE_CELLS) * 0.4;

        for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            // Distance check 2D
            const dx = x - f.x;
            const dz = z - f.z;
            if (dx * dx + dz * dz < (radius + fruitRadius) ** 2) {
                // Collected!
                this.mesh.remove(f.mesh);
                this.fruits.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    // --- DEBUG RENDERING ---
    private debugMesh: THREE.InstancedMesh | null = null;
    private showDebug: boolean = false;
    private dummy = new THREE.Object3D();
    private _colEmpty = new THREE.Color(0.2, 0.2, 0.2);
    private _colSnake = new THREE.Color(0.0, 1.0, 0.0);
    private _colFruit = new THREE.Color(1.0, 1.0, 0.0);
    private _colObs = new THREE.Color(1.0, 0.0, 1.0);

    private createDebugMesh() {
        if (this.debugMesh) {
            this.mesh.remove(this.debugMesh);
            this.debugMesh.dispose();
        }

        const startX = Math.ceil(-this.width / 2);
        const endX = Math.floor(this.width / 2);
        const startZ = Math.ceil(-this.depth / 2);
        const endZ = Math.floor(this.depth / 2);

        const cols = (endX - startX) + 1;
        const rows = (endZ - startZ) + 1;
        const count = cols * rows;

        console.log(`[Grid] Create Debug Mesh: ${cols}x${rows} = ${count} instances.`);

        // Small squares
        const geometry = new THREE.PlaneGeometry(0.8, 0.8);
        geometry.rotateX(-Math.PI / 2);

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.3,
            depthTest: false // Render on top
        });

        this.debugMesh = new THREE.InstancedMesh(geometry, material, count);
        this.debugMesh.renderOrder = 999;
        this.debugMesh.position.y = 0.5; // Float above everything
        this.mesh.add(this.debugMesh);
        console.log(`[Grid] Debug Mesh added to scene.`);
    }

    private updateDebug(snakePath: THREE.Vector3[]) {
        if (!this.showDebug || !this.debugMesh) return;

        // console.log(`[Grid] Updating Debug... SnakeLen: ${snakePath.length}`); // Verbose

        const startX = Math.ceil(-this.width / 2);
        const endX = Math.floor(this.width / 2);
        const startZ = Math.ceil(-this.depth / 2);
        const endZ = Math.floor(this.depth / 2);

        let i = 0;
        let obsCount = 0;

        for (let z = startZ; z <= endZ; z++) {
            for (let x = startX; x <= endX; x++) {
                this.dummy.position.set(x, 0, z);
                this.dummy.updateMatrix();
                this.debugMesh.setMatrixAt(i, this.dummy.matrix);

                // Determine Color
                let color = this._colEmpty;

                // 1. Obstacle?
                // Normalize key to ensure match (paranoia)
                // Keys are "${x},${z}"
                // If x is -0, it might be "0" or "-0"? Math.ceil/floor usually gives 0.
                // But let's check.
                if (this.occupiedCells.has(`${x},${z}`)) {
                    color = this._colObs;
                    obsCount++; // Count found
                }

                // 2. Fruit?
                for (const f of this.fruits) {
                    if (Math.round(f.x) === x && Math.round(f.z) === z) {
                        color = this._colFruit;
                        break;
                    }
                }

                // 3. Snake? (Override others)
                // Check distance to snake path segments
                for (let k = 0; k < snakePath.length; k++) {
                    const sp = snakePath[k];
                    // Simple discrete check
                    if (Math.round(sp.x) === x && Math.round(sp.z) === z) {
                        color = this._colSnake;
                        break;
                    }
                }

                this.debugMesh.setColorAt(i, color);
                i++;
            }
        }

        // Debug Log occasionally
        if (Math.random() < 0.01) { // 1% of frames
            console.log(`[Grid] Debug Scan: Found ${obsCount} occupied cells.`);
            console.log(`[Grid] Organisms: ${this.organisms.length}. Occupied Set Size: ${this.occupiedCells.size}`);
            if (this.occupiedCells.size > 0 && obsCount === 0) {
                // Key mismatch?
                const firstKey = this.occupiedCells.values().next().value;
                console.warn(`[Grid] MISMATCH! Set has keys (e.g. "${firstKey}") but grid loop found none. Loop range: X[${startX}, ${endX}] Z[${startZ}, ${endZ}]`);
            }
        }

        this.debugMesh.instanceMatrix.needsUpdate = true;
        if (this.debugMesh.instanceColor) this.debugMesh.instanceColor.needsUpdate = true;
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


}
