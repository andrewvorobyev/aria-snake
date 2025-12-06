import * as THREE from 'three';
import Matter from 'matter-js';
import { CONFIG } from '../constants';
import { FruitVisuals, FruitType } from './FruitVisuals';
import { OrganismVisuals } from './OrganismVisuals';

const TARGET_ORGANISM_COUNT = 6;

// Interface for Organisms with Physics
interface BlobNode {
    pos: THREE.Vector3;
    r: number;
    parentIndex: number;
    dist: number;
    wigglePhase: number;
    hasEye: boolean;
}


interface Organism {
    id: number;
    headBody: Matter.Body; // The driving force
    segmentBodies: Matter.Body[]; // Passive collision bodies for tail
    nodes: BlobNode[]; // For visuals and soft body logic
    angle: number;
    speed: number;

    visuals: OrganismVisuals;
    appearing: boolean;
    vanishing: boolean;
    scale: number;
    leaderTimer: number;
    color: THREE.Color;
}

interface Fruit {
    x: number;
    z: number;
    mesh: THREE.Mesh;
    type: FruitType;
    body: Matter.Body;
}

export class Grid {
    public mesh: THREE.Group;
    private width: number = 100;
    private depth: number = 100;

    private organisms: Organism[] = [];
    private fruits: Fruit[] = [];
    private nextOrganismId = 0;
    private time: number = 0;

    private bgMaterial: THREE.ShadowMaterial;

    // --- PHYSICS ---
    private engine: Matter.Engine;
    private world: Matter.World;
    private wallBodies: Matter.Body[] = [];
    private snakeBodies: Matter.Body[] = []; // Pool for snake path collision

    // Collision Categories
    private readonly CAT_SNAKE = 0x0001;
    private readonly CAT_ORGANISM = 0x0002;
    private readonly CAT_WALL = 0x0004;
    private readonly CAT_FRUIT = 0x0008;

    // Debug
    private debugGroup = new THREE.Group();
    private showDebug: boolean = new URLSearchParams(window.location.search).get('debug') === '1';

    constructor(aspectRatio: number) {
        this.mesh = new THREE.Group();

        // 1. Init Physics
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        this.world.gravity.y = 0; // Top-down

        this.bgMaterial = new THREE.ShadowMaterial({
            opacity: 0.2,
            side: THREE.DoubleSide
        });

        this.resize(aspectRatio);
    }

    public resize(aspectRatio: number) {
        this.depth = CONFIG.GRID.FIXED_SIDE;
        this.width = this.depth * aspectRatio;

        // Rebuild Grid Visuals
        while (this.mesh.children.length > 0) {
            this.mesh.remove(this.mesh.children[0]);
        }

        // Reset Logic
        this.organisms = [];
        this.nextOrganismId = 0;
        this.fruits = [];

        // Background Plane
        const planeGeo = new THREE.PlaneGeometry(this.width, this.depth);
        const plane = new THREE.Mesh(planeGeo, this.bgMaterial);
        plane.rotation.x = Math.PI / 2;
        plane.receiveShadow = true;
        this.mesh.add(plane);

        // Rebuild Physics Walls
        Matter.World.clear(this.world, false); // Keep engine, clear bodies
        this.snakeBodies = [];
        this.wallBodies = [];

        const wallThickness = 10;
        const halfW = this.width / 2;
        const halfD = this.depth / 2;
        const offset = wallThickness / 2;

        const options = {
            isStatic: true,
            collisionFilter: {
                category: this.CAT_WALL
            },
            label: 'Wall Body'
        };

        // Top, Bottom, Left, Right
        this.wallBodies.push(Matter.Bodies.rectangle(0, -halfD - offset, this.width, wallThickness, options));
        this.wallBodies.push(Matter.Bodies.rectangle(0, halfD + offset, this.width, wallThickness, options));
        this.wallBodies.push(Matter.Bodies.rectangle(-halfW - offset, 0, wallThickness, this.depth, options));
        this.wallBodies.push(Matter.Bodies.rectangle(halfW + offset, 0, wallThickness, this.depth, options));

        Matter.World.add(this.world, this.wallBodies);

        // Debug
        if (this.showDebug) this.createDebugMesh();
    }

    private createDebugMesh() {
        if (!this.showDebug) return;
        this.mesh.add(this.debugGroup);
        console.log(`[Grid] Debug Group added.`);
    }

    private updateDebug() {
        if (!this.showDebug) return;

        // Cleanup Geometries from previous frame to prevent memory leak
        for (const child of this.debugGroup.children) {
            if (child instanceof THREE.Line) {
                child.geometry.dispose();
            }
        }
        this.debugGroup.clear();

        const bodies = Matter.Composite.allBodies(this.world);

        bodies.forEach(body => {
            const vertices = body.vertices;
            const points: THREE.Vector3[] = [];

            vertices.forEach(v => {
                points.push(new THREE.Vector3(v.x, 1.0, v.y));
            });
            if (points.length > 0) points.push(points[0]);

            const geometry = new THREE.BufferGeometry().setFromPoints(points);

            let material = this.debugMats.wall;
            if (body.label === 'snake') material = this.debugMats.snake;
            else if (body.label === 'org_head') material = this.debugMats.head;
            else if (body.label === 'org_tail') material = this.debugMats.tail;
            else if (body.label === 'fruit') material = this.debugMats.fruit;

            const line = new THREE.Line(geometry, material);
            line.renderOrder = 999;
            this.debugGroup.add(line);
        });

        // Debug Rays
        this.organisms.forEach(org => {
            const start = org.headBody.position;
            const dirX = Math.cos(org.angle);
            const dirY = Math.sin(org.angle);

            const points = [
                new THREE.Vector3(start.x, 1.0, start.y),
                new THREE.Vector3(start.x + dirX * 4.0, 1.0, start.y + dirY * 4.0)
            ];
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(geo, this.debugMats.ray);
            line.renderOrder = 999;
            this.debugGroup.add(line);
        });
    }

    private tempVec3 = new THREE.Vector3();

    // Debug Materials (Cached to prevent leaks)
    private debugMats = {
        snake: new THREE.LineBasicMaterial({ color: 0x00ff00, depthTest: false, transparent: true }),
        head: new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, transparent: true }),
        tail: new THREE.LineBasicMaterial({ color: 0xff00ff, depthTest: false, transparent: true }),
        fruit: new THREE.LineBasicMaterial({ color: 0xffff00, depthTest: false, transparent: true }),
        wall: new THREE.LineBasicMaterial({ color: 0x888888, depthTest: false, transparent: true }),
        ray: new THREE.LineBasicMaterial({ color: 0x00ffff, depthTest: false, transparent: true })
    };

    public update(dt: number, snakePath: THREE.Vector3[]) {
        this.time += dt;

        // --- 1. Physics Engine Step ---
        Matter.Engine.update(this.engine, dt * 1000);

        // --- 2. Update Snake Physics ---
        this.updateSnakePhysics(snakePath);

        // --- 3. Clean up Organisms ---
        // (Removing old dispose logic for brevity, assuming minimal churn for now or will re-add if needed)
        // Check spawn
        if (this.organisms.length < TARGET_ORGANISM_COUNT) {
            this.spawnOrganism(snakePath);
        }

        // --- 4. Update Organisms (Blob Logic) ---
        for (let i = this.organisms.length - 1; i >= 0; i--) {
            const org = this.organisms[i];
            if (!org.nodes || org.nodes.length === 0) {
                // Remove malformed organism
                // Also remove physics body if it exists?
                if (org.headBody) Matter.World.remove(this.world, org.headBody);
                this.organisms.splice(i, 1);
                continue;
            }

            // Steering (Change Logic to Raycast)
            this.steerOrganism(org);

            // Leader Change Logic
            org.leaderTimer -= dt;
            if (org.leaderTimer <= 0 && org.nodes.length > 1) {
                // Select new leader from children
                const newLeaderIdx = 1 + Math.floor(Math.random() * (org.nodes.length - 1));

                // Swap Visual/Data (Node 0 is always the 'Driver')
                const oldLeaderNode = org.nodes[0];
                const newLeaderNode = org.nodes[newLeaderIdx];

                // Swap Pos
                const tempPos = oldLeaderNode.pos.clone();
                oldLeaderNode.pos.copy(newLeaderNode.pos);
                newLeaderNode.pos.copy(tempPos);

                // Swap Radius
                const tempR = oldLeaderNode.r;
                oldLeaderNode.r = newLeaderNode.r;
                newLeaderNode.r = tempR;

                // Sync Physics Bodies to new positions
                Matter.Body.setPosition(org.headBody, { x: oldLeaderNode.pos.x, y: oldLeaderNode.pos.z });
                Matter.Body.setPosition(org.segmentBodies[newLeaderIdx], { x: newLeaderNode.pos.x, y: newLeaderNode.pos.z });

                // Reset Timer
                const minT = CONFIG.ORGANISMS.LEADER_CHANGE_INTERVAL.MIN;
                const maxT = CONFIG.ORGANISMS.LEADER_CHANGE_INTERVAL.MAX;
                org.leaderTimer = minT + Math.random() * (maxT - minT);
            }

            // Sync Head Node (Node 0) with Head Body
            const headPos = org.headBody.position;
            org.nodes[0].pos.set(headPos.x, 0, headPos.y);

            // Update Body Nodes (Soft Body / Chain Logic)
            for (let i = 1; i < org.nodes.length; i++) {
                const node = org.nodes[i];
                const parent = org.nodes[node.parentIndex];

                // Ideal Target Position relative to parent
                // We want to drag it.
                // Vector from Node to Parent
                this.tempVec3.subVectors(parent.pos, node.pos);
                const currentDist = this.tempVec3.length();

                // Spring / Constraint
                if (currentDist > node.dist) {
                    // Pull towards parent
                    const k = 0.15; // Stiffness
                    const pull = (currentDist - node.dist) * k;
                    this.tempVec3.normalize().multiplyScalar(pull);
                    node.pos.add(this.tempVec3);
                }

                // Wiggle (Bacteria-like movement)
                const wiggleX = Math.sin(this.time * 4.0 + node.wigglePhase) * 0.02;
                const wiggleZ = Math.cos(this.time * 3.0 + node.wigglePhase) * 0.02;
                node.pos.x += wiggleX;
                node.pos.z += wiggleZ;

                // Sync Physics Body (Collider)
                Matter.Body.setPosition(org.segmentBodies[i], { x: node.pos.x, y: node.pos.z });
            }

            // Pass Node Data to Visuals
            // Maps nodes to flat array for Shader
            const renderNodes = org.nodes.map(n => ({ x: n.pos.x, z: n.pos.z, r: n.r, hasEye: n.hasEye }));
            org.visuals.update(renderNodes, dt);
            if (org.color) org.visuals.setColor(org.color);
        }

        // --- 5. Manage Fruit ---
        if (this.fruits.length < CONFIG.FRUIT.TARGET_COUNT) {
            this.spawnFruit();
        }

        // Fruit Animations
        this.fruits.forEach(f => {
            if (f.mesh.material instanceof THREE.ShaderMaterial) {
                const t = f.mesh.material.uniforms.uTime.value += dt;
                const seed = f.x * 12.34 + f.z * 56.78;
                f.mesh.rotation.y = Math.sin(t * 2.0 + seed) * 0.15;
            }
        });

        // --- 6. Update Debug Renderer ---
        this.updateDebug();
    }

    private updateSnakePhysics(snakePath: THREE.Vector3[]) {
        // Pool Management for Snake Bodies
        // We represent the snake path as a series of circles

        const r = 0.5; // Snake Radius
        const separation = 0.8; // Distance between physics bodies (optimization)

        let bodyIdx = 0;

        if (snakePath.length > 0) {
            let lastPos = snakePath[0];

            // Add/Update Head Body
            this.ensureSnakeBody(bodyIdx, lastPos.x, lastPos.z, r);
            bodyIdx++;

            // Walk path
            for (let i = 1; i < snakePath.length; i++) {
                const p = snakePath[i];
                if (p.distanceTo(lastPos) >= separation) {
                    this.ensureSnakeBody(bodyIdx, p.x, p.z, r);
                    bodyIdx++;
                    lastPos = p;
                }
            }
        }

        // Hide/Remove unused bodies
        for (let i = bodyIdx; i < this.snakeBodies.length; i++) {
            Matter.Body.setPosition(this.snakeBodies[i], { x: 9999, y: 9999 }); // Move away
            // Or remove from world? Moving away is cheaper than add/remove churn
        }
    }

    private ensureSnakeBody(index: number, x: number, z: number, r: number) {
        if (index >= this.snakeBodies.length) {
            // Create new
            const body = Matter.Bodies.circle(x, z, r, {
                isStatic: true, // Snake acts as static obstacle for organisms (they steer around it)
                // But wait, organisms push against it? 
                // User said "snake can go through them". 
                // If snake is static, organisms will bounce off it.
                collisionFilter: {
                    category: this.CAT_SNAKE,
                },
                label: 'snake'
            });
            Matter.World.add(this.world, body);
            this.snakeBodies.push(body);
        } else {
            // Update existing
            Matter.Body.setPosition(this.snakeBodies[index], { x, y: z });
        }
    }

    private steerOrganism(org: Organism) {
        // Raycast parameters
        const lookAhead = 4.0;
        const rayWidth = 0.5; // Narrower ray to avoid clipping self-edges

        // Filter Obstacles (Exclude Self)
        const allBodies = Matter.Composite.allBodies(this.world);
        const obstacles = allBodies.filter(b =>
            b !== org.headBody &&
            !org.segmentBodies.includes(b)
        );

        const rayStart = org.headBody.position;
        const rayEnd = {
            x: rayStart.x + Math.cos(org.angle) * lookAhead,
            y: rayStart.y + Math.sin(org.angle) * lookAhead
        };

        const collisions = Matter.Query.ray(obstacles, rayStart, rayEnd, rayWidth);
        const hit = collisions.length > 0;

        if (hit) {
            // Blocked, turn
            org.angle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2);
        } else {
            // Clear, Wander
            org.angle += (Math.random() - 0.5) * 0.1; // Reduced wander jitter
        }

        // Apply Velocity
        // Velocity in Matter.js is per-update. 
        // We set it directly to control movement precisely.
        const vx = Math.cos(org.angle) * org.speed;
        const vz = Math.sin(org.angle) * org.speed;

        Matter.Body.setVelocity(org.headBody, { x: vx, y: vz });
    }

    private spawnOrganism(snakePath: THREE.Vector3[]) {
        for (let attempt = 0; attempt < 10; attempt++) {
            const rx = (Math.random() - 0.5) * (this.width - 6);
            const rz = (Math.random() - 0.5) * (this.depth - 6);

            // Check clearance 
            if (snakePath.length > 0 && snakePath[0].distanceTo(new THREE.Vector3(rx, 0, rz)) < 8) continue;

            const conf = CONFIG.ORGANISMS;

            // 1. Create Head Body (Driver)
            const headBody = Matter.Bodies.circle(rx, rz, 0.6, {
                frictionAir: 0,
                friction: 0,
                restitution: 0,
                inertia: Infinity,
                collisionFilter: { category: this.CAT_ORGANISM },
                label: 'org_head'
            });
            Matter.World.add(this.world, headBody);

            // 2. Generate Blob Nodes
            const nodes: BlobNode[] = [];
            const segmentBodies: Matter.Body[] = [];

            // Head Node
            const count = conf.BLOB_COUNT.MIN + Math.floor(Math.random() * (conf.BLOB_COUNT.MAX - conf.BLOB_COUNT.MIN + 1));
            const headR = conf.RADIUS.MIN + Math.random() * (conf.RADIUS.MAX - conf.RADIUS.MIN);

            const headNode: BlobNode = {
                pos: new THREE.Vector3(rx, 0, rz),
                r: headR,
                parentIndex: -1,
                dist: 0,
                wigglePhase: Math.random() * 10,
                hasEye: false
            };
            nodes.push(headNode);
            segmentBodies.push(headBody);

            // 3. Child Nodes
            for (let i = 0; i < count; i++) {
                const parentIdx = 0;
                const parent = nodes[parentIdx];

                const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5);
                const dist = conf.SPACING.MIN + Math.random() * (conf.SPACING.MAX - conf.SPACING.MIN);

                const nx = parent.pos.x + Math.cos(angle) * dist;
                const nz = parent.pos.z + Math.sin(angle) * dist;
                const r = conf.RADIUS.MIN + Math.random() * (conf.RADIUS.MAX - conf.RADIUS.MIN);

                nodes.push({
                    pos: new THREE.Vector3(nx, 0, nz),
                    r: r,
                    parentIndex: parentIdx,
                    dist: dist,
                    wigglePhase: Math.random() * 10,
                    hasEye: false
                });

                // Create Sensor Body for this blob part
                const body = Matter.Bodies.circle(nx, nz, r * 0.7, {
                    isSensor: true,
                    isStatic: true, // They drag with visuals
                    collisionFilter: {
                        category: this.CAT_ORGANISM,
                        mask: this.CAT_SNAKE | this.CAT_WALL
                    },
                    label: 'org_tail'
                });
                Matter.World.add(this.world, body);
                segmentBodies.push(body);
            }

            // --- Assign Eyes ---
            const totalNodes = nodes.length;
            const eyeMin = conf.EYE_COUNT.MIN;
            const eyeMax = Math.min(conf.EYE_COUNT.MAX, totalNodes); // Cannot have more eyes than nodes
            const numEyes = eyeMin + Math.floor(Math.random() * (eyeMax - eyeMin + 1));

            // Create array of indices [0, 1, 2, ... totalNodes-1]
            const indices = Array.from({ length: totalNodes }, (_, i) => i);

            // Shuffle indices (Fisher-Yates)
            for (let i = indices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [indices[i], indices[j]] = [indices[j], indices[i]];
            }

            // Assign eyes to the first 'numEyes' indices
            for (let i = 0; i < numEyes; i++) {
                nodes[indices[i]].hasEye = true;
            }

            const visuals = new OrganismVisuals();
            const renderData = nodes.map(n => ({ x: n.pos.x, z: n.pos.z, r: n.r, hasEye: n.hasEye }));
            visuals.update(renderData, 0);
            this.mesh.add(visuals.mesh);

            const speed = conf.SPEED.MIN + Math.random() * (conf.SPEED.MAX - conf.SPEED.MIN);
            const minT = conf.LEADER_CHANGE_INTERVAL.MIN;
            const maxT = conf.LEADER_CHANGE_INTERVAL.MAX;

            this.organisms.push({
                id: this.nextOrganismId++,
                headBody: headBody,
                segmentBodies: segmentBodies,
                nodes: nodes,
                angle: Math.random() * Math.PI * 2,
                speed: speed,
                visuals: visuals,
                appearing: true,
                vanishing: false,
                scale: 1.0,
                color: new THREE.Color().setHSL(Math.random(), 0.6, 0.4),
                leaderTimer: minT + Math.random() * (maxT - minT)
            });
            return;
        }
    }

    private spawnFruit() {
        const sizeCells = CONFIG.FRUIT.SIZE_CELLS;
        // Random spot
        for (let i = 0; i < 10; i++) {
            const rx = (Math.random() - 0.5) * (this.width - 2);
            const rz = (Math.random() - 0.5) * (this.depth - 2);

            // Create Sensor Body
            const r = 0.5;
            const bodies = Matter.Query.region(Matter.Composite.allBodies(this.world), {
                min: { x: rx - r, y: rz - r },
                max: { x: rx + r, y: rz + r }
            });
            if (bodies.length > 0) continue;

            const type = Math.floor(Math.random() * 2) as FruitType;
            const mesh = FruitVisuals.createFruitMesh(type);
            mesh.position.set(rx, 0, rz);
            const scale = sizeCells * CONFIG.GRID.CELL_SIZE * 0.8;
            mesh.scale.multiplyScalar(scale);
            this.mesh.add(mesh);

            const body = Matter.Bodies.circle(rx, rz, 0.5 * scale, {
                isSensor: true, // Fruits are sensors
                isStatic: true,
                collisionFilter: { category: this.CAT_FRUIT },
                label: 'fruit'
            });
            Matter.World.add(this.world, body);

            this.fruits.push({ x: rx, z: rz, mesh, type, body });
            return;
        }
    }

    // --- Public API for Snake Movement (Raycast) ---
    public isPositionBlocked(x: number, z: number, radius: number): boolean {
        // Create a temporary body check? 
        // Or just Query.region or Query.collides
        // User asked for Raycast? 
        // But block check is usually volumetric.
        // "Raycast for determining if movement is possible in a given direction"
        // Game.ts calls isPositionBlocked(x, z). 
        // This checks if the target circle is blocked.

        const bodies = Matter.Composite.allBodies(this.world);

        // Simple circle overlap check against all static/relevant bodies
        // Matter does not expose a direct 'CheckCircle' easily without creating a body.

        // Visualization of this check? (Red circle?)

        // Bounds check
        const halfW = this.width / 2;
        const halfD = this.depth / 2;
        if (x < -halfW + radius || x > halfW - radius || z < -halfD + radius || z > halfD - radius) return true;

        // Check Bodies
        for (const b of bodies) {
            if (b.label === 'snake') continue; // Don't collide with self (assuming this is for Snake Head)
            if (b.label === 'fruit') continue; // Fruits don't block

            // Check Circle vs Body (Polygon/Circle)
            // Matter.SAT?
            // Simple bounds or distance check for circles is fast.
            if (b.circleRadius) {
                const dx = x - b.position.x;
                const dy = z - b.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < (radius + b.circleRadius)) return true;
            } else {
                // Rectangle (Wall)
                // AABB?
                if (Matter.Bounds.overlaps(b.bounds, {
                    min: { x: x - radius, y: z - radius },
                    max: { x: x + radius, y: z + radius }
                })) return true;
            }
        }

        return false;
    }

    public handleFruitCollection(x: number, z: number, radius: number): boolean {
        // Check fruits
        for (let i = 0; i < this.fruits.length; i++) {
            const f = this.fruits[i];
            const dx = x - f.x;
            const dz = z - f.z;
            if (dx * dx + dz * dz < (radius + 0.5) ** 2) {
                // Collected
                this.mesh.remove(f.mesh);
                Matter.World.remove(this.world, f.body);
                this.fruits.splice(i, 1);
                return true;
            }
        }
        return false;
    }

}
