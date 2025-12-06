import * as THREE from 'three';
import { CONFIG } from '../constants';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { Snake } from './Snake';
import { Grid } from './Grid';

export class Game {
    private renderer: Renderer;
    private input: Input;
    private snake: Snake;
    private grid: Grid;
    private lastTime: number = 0;
    private animationId: number = 0;

    constructor() {
        this.renderer = new Renderer('app');
        this.input = new Input();

        // Grid first to know bounds? Grid resizes based on camera/window, so initially we rely on current window.
        this.grid = new Grid(this.renderer.getAspectRatio());
        this.renderer.scene.add(this.grid.mesh);

        // Fit camera to grid immediately
        const gridPhysicalHeight = CONFIG.GRID.FIXED_SIDE * CONFIG.GRID.CELL_SIZE;
        this.renderer.fitCameraToGrid(gridPhysicalHeight);

        this.snake = new Snake(new THREE.Vector3(0, 0.5, 0));
        this.renderer.scene.add(this.snake.mesh);

        // Listen to resize to update grid
        window.addEventListener('game-resize', ((e: CustomEvent) => {
            this.grid.resize(e.detail.aspect);
            this.renderer.fitCameraToGrid(gridPhysicalHeight);
            this.resetGame();
        }) as EventListener);
    }

    public start() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    private loop(time: number) {
        const dt = Math.min((time - this.lastTime) / 1000, 0.1); // Cap dt
        this.lastTime = time;

        this.update(dt);
        this.renderer.render();

        this.animationId = requestAnimationFrame(this.loop.bind(this));
    }

    private update(dt: number) {
        // Input
        const direction = this.input.getDirection();
        const speed = CONFIG.SNAKE.SPEED; // Assuming speed is accessible or move speed to Game/Snake config

        // We can also ask snake for its speed if we want to keep it encapsulated
        // For now using constant.

        // Calculate proposed move
        let moveX = direction.x * speed * dt;
        let moveZ = direction.y * speed * dt; // input y mapped to z

        const currentPos = this.snake.getHeadPosition();
        const r = CONFIG.SNAKE.CIRCLE_RADIUS;

        // Try moving X
        if (Math.abs(moveX) > 0.0001) {
            if (!this.grid.isPositionBlocked(currentPos.x + moveX, currentPos.z, r)) {
                // Safe to move X
            } else {
                moveX = 0; // Blocked
                this.snake.triggerBlink(); // Visual feedback
                // No reset, just block
            }
        }

        // Try moving Z
        // We check Z with the *potentially moved* X? Or independently?
        // Classic top down sliding usually checks independently against current pos,
        // OR recursively (check X then check Z from new X).
        // Let's do check Z from new X for smoother sliding along corners.

        // Temporarily apply X
        const tempX = currentPos.x + moveX;

        if (Math.abs(moveZ) > 0.0001) {
            if (!this.grid.isPositionBlocked(tempX, currentPos.z + moveZ, r)) {
                // Safe to move Z
            } else {
                moveZ = 0;
            }
        }

        const finalMove = new THREE.Vector3(moveX, 0, moveZ);
        this.snake.move(finalMove);
        this.snake.animate(dt);

        // Fruit Collection
        const newHeadPos = this.snake.getHeadPosition();
        if (this.grid.handleFruitCollection(newHeadPos.x, newHeadPos.z, r)) {
            console.log("Nom!");
        }

        // Grid Update (spawning obstacles/fruit)
        this.grid.update(dt, newHeadPos);
    }

    private resetGame() {
        // Remove old snake
        this.renderer.scene.remove(this.snake.mesh);

        // New Snake
        this.snake = new Snake(new THREE.Vector3(0, 0.5, 0));
        this.renderer.scene.add(this.snake.mesh);

        // Grid handles its own internal fruit/obstacle cleanup if we wanted full reset, 
        // but "No score" and "Alive grid" implies the world persists, just player resets?
        // Let's keep the grid state for continuity ("fun chaos").
    }
}
