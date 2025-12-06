import { SnakeVisuals } from './SnakeVisuals';
import * as THREE from 'three';
import { CONFIG } from '../constants';

export class Snake {
    public mesh: THREE.Group;
    private visuals: SnakeVisuals;

    // Movement
    private position: THREE.Vector3;
    private path: THREE.Vector3[] = [];
    // Logical body parts count for length, but logic resides in path length now mostly
    private length: number = CONFIG.SNAKE.INITIAL_LENGTH;

    constructor(startPos: THREE.Vector3) {
        this.position = startPos.clone();

        // Initialize path in a spiral coil
        const pointsPerUnit = 5;
        const totalPoints = this.length * pointsPerUnit;
        const coilGap = CONFIG.SNAKE.CIRCLE_RADIUS * 2.5; // Gap between coils

        let angle = Math.PI / 2; // Start at +Z (tail trails behind head at +Z)

        for (let i = 0; i < totalPoints; i++) {
            // Archimedean spiral: r = b * theta
            // We shift theta so r starts at 0 when angle is PI/2
            const thetaDiff = angle - Math.PI / 2;
            const b = coilGap / (2 * Math.PI);
            const r = b * thetaDiff;

            const x = Math.cos(angle) * r;
            const z = Math.sin(angle) * r;

            const p = this.position.clone().add(new THREE.Vector3(x, 0, z));
            this.path.push(p);

            // Increment angle to maintain roughly constant point spacing (0.1)
            // Arc length ds = 0.1
            // ds ~ r * dTheta => dTheta = ds / r
            // avoid div by zero for first points
            const effectiveR = Math.max(r, 0.2);
            const dTheta = 0.2 / effectiveR; // 0.2 spacing for smoother init
            angle += dTheta;
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

                // Limit Path Length
                const maxPoints = Math.ceil(this.length * 5);
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
