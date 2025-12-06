import * as THREE from 'three';
import { CONFIG } from '../constants';

export class Snake {
    public mesh: THREE.Group;
    private head: THREE.Mesh;
    private eyes: THREE.Group;
    private bodyParts: THREE.Mesh[] = [];

    // Movement
    private position: THREE.Vector3;
    private path: THREE.Vector3[] = []; // History of positions for body to follow

    // Animation
    private pulseTime: number = 0;

    constructor(startPos: THREE.Vector3) {
        this.position = startPos.clone();
        this.mesh = new THREE.Group();
        this.path.push(this.position.clone());

        // Create Head
        const geometry = new THREE.SphereGeometry(CONFIG.SNAKE.CIRCLE_RADIUS, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: CONFIG.SNAKE.HEAD_COLOR });
        this.head = new THREE.Mesh(geometry, material);
        this.head.castShadow = true;
        this.mesh.add(this.head);

        // Create Eyes
        this.eyes = this.createEyes();
        this.head.add(this.eyes);

        // Initial Body
        for (let i = 0; i < CONFIG.SNAKE.INITIAL_LENGTH; i++) {
            this.addBodySegment();
        }
    }

    private createEyes(): THREE.Group {
        const eyesGroup = new THREE.Group();

        const eyeGeo = new THREE.SphereGeometry(0.15, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: CONFIG.SNAKE.EYE_COLOR });
        const pupilGeo = new THREE.SphereGeometry(0.07, 8, 8);
        const pupilMat = new THREE.MeshBasicMaterial({ color: CONFIG.SNAKE.PUPIL_COLOR });

        // Left Eye
        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
        leftPupil.position.z = 0.12;
        leftEye.add(leftPupil);
        leftEye.position.set(-0.2, 0.2, 0.2); // Relative to head

        // Right Eye
        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
        rightPupil.position.z = 0.12;
        rightEye.add(rightPupil);
        rightEye.position.set(0.2, 0.2, 0.2);

        eyesGroup.add(leftEye, rightEye);
        return eyesGroup;
    }

    private addBodySegment() {
        const geometry = new THREE.SphereGeometry(CONFIG.SNAKE.CIRCLE_RADIUS, 16, 16);
        const material = new THREE.MeshStandardMaterial({ color: CONFIG.SNAKE.BODY_COLOR });
        const segment = new THREE.Mesh(geometry, material);
        segment.castShadow = true;
        this.bodyParts.push(segment);
        this.mesh.add(segment);
    }

    public move(displacement: THREE.Vector3) {
        if (displacement.lengthSq() < 0.000001) return;

        this.position.add(displacement);

        // Rotate head to face direction
        const targetPos = this.head.position.clone().add(displacement);
        this.head.lookAt(targetPos);

        // Update Path History
        const lastPoint = this.path[0];
        const dist = this.position.distanceTo(lastPoint);

        // Add point if we moved enough
        if (dist > 0.1) {
            this.path.unshift(this.position.clone());
            const maxPath = (this.bodyParts.length + 5) * (CONFIG.SNAKE.CIRCLE_RADIUS * 2) * 10;
            if (this.path.length > maxPath) {
                this.path.length = maxPath;
            }
        }

        // Update Head Mesh Position
        this.head.position.copy(this.position);

        // Update Body Segments
        this.updateBodySegments();
    }

    public animate(dt: number) {
        // Pulse Animation
        this.pulseTime += dt * CONFIG.SNAKE.PULSE_SPEED;
        this.bodyParts.forEach((part, i) => {
            const offset = i * 0.5;
            // Pulse Size
            const scale = 1 + Math.sin(this.pulseTime - offset) * 0.1; // Reduced pulse for better look
            part.scale.setScalar(scale);

            // Rainbow Color
            // Cycle Hue over time and along body
            const hue = (this.pulseTime * 0.1 + i * 0.05) % 1;
            const mat = part.material as THREE.MeshStandardMaterial;
            mat.color.setHSL(hue, 1.0, 0.5);
        });

        // Animate Eyes (Blink)
        if (Math.random() < 0.01) {
            this.eyes.scale.y = 0.1;
        } else {
            this.eyes.scale.y = THREE.MathUtils.lerp(this.eyes.scale.y, 1, dt * 10);
        }
    }

    private updateBodySegments() {
        const spacing = CONFIG.SNAKE.CIRCLE_RADIUS * 0.7; // Overlap for continuous snake lookdex = 0;
        let pathIndex = 0;

        for (let i = 0; i < this.bodyParts.length; i++) {
            const targetDist = (i + 1) * spacing;
            let d = 0;

            // Resume search from last pathIndex to be more efficient? 
            // No, need to start from 0 because path[0] is head
            pathIndex = 0;

            while (pathIndex < this.path.length - 1) {
                const p1 = this.path[pathIndex];
                const p2 = this.path[pathIndex + 1];
                const segmentLen = p1.distanceTo(p2);

                if (d + segmentLen >= targetDist) {
                    const remaining = targetDist - d;
                    const alpha = remaining / segmentLen;
                    const pos = new THREE.Vector3().lerpVectors(p1, p2, alpha);
                    this.bodyParts[i].position.copy(pos);
                    break;
                }

                d += segmentLen;
                pathIndex++;
            }
        }
    }

    public getHeadPosition(): THREE.Vector3 {
        return this.position.clone();
    }

    public getSegments(): THREE.Mesh[] {
        return [this.head, ...this.bodyParts];
    }
}
