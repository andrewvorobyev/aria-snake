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

        // Fill initial path - all at head position to start
        for (let i = 0; i < this.length; i++) {
            this.path.push(this.position.clone()); // Stacked at start
        }

        this.visuals = new SnakeVisuals();
        this.mesh = this.visuals.mesh;

        this.visuals.update(0, this.path);
    }

    public move(displacement: THREE.Vector3) {
        // Always update path history continuously
        if (displacement.lengthSq() > 0.000001) {
            this.position.add(displacement);

            const lastHead = this.path[0];
            const dist = this.position.distanceTo(lastHead);

            // Higher fidelity path recording
            if (dist > 0.1) {
                this.path.unshift(this.position.clone());

                // Limit Path Length
                // Logical length is approximate based on points density
                // Let's keep enough points. 
                const maxPoints = Math.ceil(this.length * 5); // 5 points per unit length roughly?
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

    // Helper to get bounding for collision if needed?
    // Collision uses checking Logic Grid independently usually.
}
