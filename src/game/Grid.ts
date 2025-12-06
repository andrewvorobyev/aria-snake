import * as THREE from 'three';
import { CONFIG } from '../constants';

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
}

export class Grid {
    public mesh: THREE.Group;
    private width: number = 100; // Will be set on resize
    private depth: number = 100; // Will be set on resize
    private obstacles: Obstacle[] = [];
    private fruits: Fruit[] = [];

    private obstacleGeometry: THREE.BoxGeometry;
    private obstacleMaterial: THREE.MeshStandardMaterial;
    private fruitGeometry: THREE.SphereGeometry;
    private fruitMaterial: THREE.MeshStandardMaterial;

    private occupiedCells: Set<string> = new Set();

    constructor(aspectRatio: number) {
        this.mesh = new THREE.Group();

        this.obstacleGeometry = new THREE.BoxGeometry(CONFIG.GRID.CELL_SIZE * 0.9, 1, CONFIG.GRID.CELL_SIZE * 0.9);
        this.obstacleMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.COLORS.OBSTACLE });

        this.fruitGeometry = new THREE.SphereGeometry(CONFIG.GRID.CELL_SIZE * 0.4);
        this.fruitMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.COLORS.FRUIT });

        this.resize(aspectRatio);
    }

    public resize(aspectRatio: number) {
        this.depth = CONFIG.GRID.FIXED_SIDE;
        this.width = Math.floor(this.depth * aspectRatio);

        // Rebuild Grid Visuals (Lines)
        while (this.mesh.children.length > 0) {
            this.mesh.remove(this.mesh.children[0]);
        }
        this.obstacles = [];
        this.fruits = [];
        this.occupiedCells.clear();

        this.createGridLines();

        const planeGeo = new THREE.PlaneGeometry(this.width, this.depth);
        const planeMat = new THREE.MeshBasicMaterial({ color: CONFIG.COLORS.BACKGROUND, side: THREE.DoubleSide });
        const plane = new THREE.Mesh(planeGeo, planeMat);
        plane.rotation.x = Math.PI / 2;
        plane.receiveShadow = true;
        this.mesh.add(plane);
    }

    private createGridLines() {
        const material = new THREE.LineBasicMaterial({ color: CONFIG.COLORS.GRID_LINES });
        const points: THREE.Vector3[] = [];
        const halfW = this.width / 2;
        const halfD = this.depth / 2;

        // Lines along Z (Vertical)
        for (let x = -halfW; x <= halfW; x += CONFIG.GRID.CELL_SIZE) {
            points.push(new THREE.Vector3(x, 0, -halfD));
            points.push(new THREE.Vector3(x, 0, halfD));
        }

        // Lines along X (Horizontal)
        for (let z = -halfD; z <= halfD; z += CONFIG.GRID.CELL_SIZE) {
            points.push(new THREE.Vector3(-halfW, 0, z));
            points.push(new THREE.Vector3(halfW, 0, z));
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const lines = new THREE.LineSegments(geometry, material);
        this.mesh.add(lines);
    }

    public update(dt: number, snakeHeadPos: THREE.Vector3) {
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
            this.spawnObstacle(snakeHeadPos);
        }

        // 2. Manage Fruit
        if (this.fruits.length === 0) {
            this.spawnFruit(snakeHeadPos);
        }
    }

    private spawnObstacle(snakeH: THREE.Vector3) {
        const pos = this.getRandomEmptyCell(snakeH, 5);
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

    private spawnFruit(snakeH: THREE.Vector3) {
        const pos = this.getRandomEmptyCell(snakeH, 2);
        if (pos) {
            const mesh = new THREE.Mesh(this.fruitGeometry, this.fruitMaterial);
            mesh.position.set(pos.x, 0.5, pos.z);
            mesh.castShadow = true;
            this.mesh.add(mesh);

            this.fruits.push({
                x: pos.x,
                z: pos.z,
                mesh: mesh
            });
        }
    }

    public isPositionBlocked(x: number, z: number, radius: number): boolean {
        // Wall
        const halfW = this.width / 2;
        const halfD = this.depth / 2;

        // Check boundaries (taking radius into account to keep snake fully inside or at least center inside?)
        // Let's block center at boundary for now
        if (x < -halfW || x > halfW || z < -halfD || z > halfD) {
            return true;
        }

        // Obstacles
        for (const obs of this.obstacles) {
            // AABB check for optimization, then radius if needed. 
            // Obstacle is Cube ~0.9 size centered at obs.x, obs.z
            // Snake is sphere radius 'r'
            // Simple Circle vs AABB

            const closestX = Math.max(obs.x - 0.45, Math.min(x, obs.x + 0.45));
            const closestZ = Math.max(obs.z - 0.45, Math.min(z, obs.z + 0.45));

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
        for (let i = this.fruits.length - 1; i >= 0; i--) {
            const f = this.fruits[i];
            const dist = Math.sqrt((x - f.x) ** 2 + (z - f.z) ** 2);
            if (dist < radius + 0.4) { // radius sum
                // Remove fruit
                this.mesh.remove(f.mesh);
                this.fruits.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    private getRandomEmptyCell(bboxCenter: THREE.Vector3, bboxRadius: number): { x: number, z: number } | null {
        // Try N times to find a spot
        for (let i = 0; i < 20; i++) {
            const halfW = this.width / 2;
            const halfD = this.depth / 2;

            const kx = Math.floor(Math.random() * (this.width / CONFIG.GRID.CELL_SIZE));
            const kz = Math.floor(Math.random() * (this.depth / CONFIG.GRID.CELL_SIZE));

            const cx = -halfW + 0.5 * CONFIG.GRID.CELL_SIZE + kx * CONFIG.GRID.CELL_SIZE;
            const cz = -halfD + 0.5 * CONFIG.GRID.CELL_SIZE + kz * CONFIG.GRID.CELL_SIZE;

            // Check distance from snake head (safe zone)
            const d = Math.sqrt((cx - bboxCenter.x) ** 2 + (cz - bboxCenter.z) ** 2);
            if (d < bboxRadius) continue;

            // Check occupation
            const key = `${Math.round(cx)},${Math.round(cz)}`;
            if (this.occupiedCells.has(key)) continue;

            // Check existing fruits
            if (this.fruits.some(f => Math.abs(f.x - cx) < 0.1 && Math.abs(f.z - cz) < 0.1)) continue;

            return { x: cx, z: cz };
        }
        return null;
    }
}
