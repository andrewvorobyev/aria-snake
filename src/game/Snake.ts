import { SnakeVisuals } from './SnakeVisuals';
import * as THREE from 'three';
import { CONFIG } from '../constants';

export class Snake {
    public mesh: THREE.Group;
    private visuals: SnakeVisuals;

    // Movement
    private position: THREE.Vector3;
    private path: THREE.Vector3[] = [];
    // Number of visual nodes
    private nodeCount: number = CONFIG.SNAKE.INITIAL_NODES;

    constructor(startPos: THREE.Vector3) {
        this.position = startPos.clone();

        // Initialize path in a spiral coil
        const nodeSpacing = CONFIG.SNAKE.NODE_SPACING;
        const pathSpacing = 0.1; // Dense path for smooth movement
        const requiredPathLength = this.nodeCount * nodeSpacing; // Total arc length needed

        const coilGap = CONFIG.SNAKE.CIRCLE_RADIUS * 2.2; // Gap between coils
        let angle = 0;
        let accumulatedLength = 0;
        let lastPoint = startPos.clone();

        // First point is the head
        this.path.push(startPos.clone());

        // Generate spiral until we have enough arc length
        while (accumulatedLength < requiredPathLength) {
            // Archimedean spiral: r = b * theta
            const b = coilGap / (2 * Math.PI);
            const r = b * angle;

            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            const p = this.position.clone().add(new THREE.Vector3(x, 0, z));

            // Calculate actual distance from last point
            const dist = p.distanceTo(lastPoint);

            if (dist >= pathSpacing) {
                this.path.push(p);
                accumulatedLength += dist;
                lastPoint = p;
            }

            // Increment angle - smaller steps for accuracy
            const effectiveR = Math.max(r, 0.2);
            const dTheta = pathSpacing / (effectiveR * 2);
            angle += dTheta;

            // Safety limit
            if (this.path.length > 2000) break;
        }

        this.visuals = new SnakeVisuals();
        this.mesh = this.visuals.mesh;

        this.visuals.update(0, this.path);
    }

    public move(displacement: THREE.Vector3) {
        // Always update path history continuously
        if (displacement.lengthSq() > 0.000001) {
            this.position.add(displacement);

            // Interpolate points if large jump (lag or large dt)
            let lastHead = this.path[0];
            let dist = this.position.distanceTo(lastHead);

            const spacing = 0.1;

            while (dist > spacing) {
                // Direction from last recorded point to current real head
                const dir = new THREE.Vector3().subVectors(this.position, lastHead).normalize();
                const newPoint = lastHead.clone().add(dir.multiplyScalar(spacing));

                this.path.unshift(newPoint);
                lastHead = newPoint; // Advance reference
                dist -= spacing; // Remaining distance

                // Limit Path Length based on node count and spacing
                const nodeSpacing = CONFIG.SNAKE.NODE_SPACING;
                const maxPathLength = this.nodeCount * nodeSpacing;
                const maxPoints = Math.ceil(maxPathLength / spacing);
                if (this.path.length > maxPoints) {
                    this.path.length = maxPoints;
                }
            }
        }
    }

    public animate(dt: number) {
        this.visuals.update(dt, this.path);
    }

    public getHeadPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public getPath(): THREE.Vector3[] {
        return this.path;
    }

    public triggerBlink() {
        this.visuals.triggerBlink();
    }

    public triggerEat() {
        this.visuals.triggerEat();
    }
}
