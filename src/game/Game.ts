import * as THREE from 'three';
import { CONFIG } from '../constants';
import { Renderer } from './Renderer';
import { Input } from './Input';
import { Snake } from './Snake';
import { Grid } from './Grid';
import { Background } from './Background';
import { Audio } from './Audio';
import { ParticleSystem } from './Particles';

export class Game {
    private renderer: Renderer;
    private input: Input;
    private snake: Snake;
    private grid: Grid;
    private background: Background;
    private audio: Audio;
    private particles: ParticleSystem;
    private musicStarted: boolean = false;
    private lastTime: number = 0;
    private frameCount: number = 0;
    private timeAccumulator: number = 0;
    private frameInterval: number = 1000 / 60;

    constructor() {
        this.renderer = new Renderer('app');
        this.input = new Input();
        this.audio = new Audio();

        // Grid first to know bounds? Grid resizes based on camera/window, so initially we rely on current window.
        this.grid = new Grid(this.renderer.getAspectRatio());
        this.renderer.scene.add(this.grid.mesh);

        this.background = new Background();
        this.renderer.scene.add(this.background.mesh);

        // Fit camera to grid immediately
        const gridPhysicalHeight = CONFIG.GRID.FIXED_SIDE * CONFIG.GRID.CELL_SIZE;
        this.renderer.fitCameraToGrid(gridPhysicalHeight);

        this.snake = new Snake(new THREE.Vector3(0, 0.5, 0));
        this.renderer.scene.add(this.snake.mesh);

        // Particle system
        this.particles = new ParticleSystem();
        this.renderer.scene.add(this.particles.group);

        // Listen to resize to update grid
        window.addEventListener('game-resize', ((e: CustomEvent) => {
            this.grid.resize(e.detail.aspect);
            this.renderer.fitCameraToGrid(gridPhysicalHeight);
            // Don't reset snake on resize, just let the world expand/contract
        }) as EventListener);
    }

    public start() {
        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    private loop(time: number) {
        requestAnimationFrame(this.loop.bind(this));

        const elapsed = time - this.lastTime;

        // Limit to ~60 FPS. 
        // On 120Hz screens, rAF fires every ~8.3ms.
        // We want to skip the first call (8.3ms) and take the second (16.6ms).
        // Using a threshold slightly lower than 16.6ms (e.g. 14ms) ensures we catch it 
        // even if it arrives slightly early (jitter), but definitely skip the 8.3ms one.
        if (elapsed < 14.0) return;

        const dt = Math.min(elapsed / 1000, 0.1); // Cap dt

        // Simple update - rely on v-sync cadence for smoothness
        this.lastTime = time;

        this.update(dt);
        this.renderer.render();

        // FPS Calc
        this.frameCount++;
        this.timeAccumulator += dt;
        if (this.timeAccumulator >= 0.5) {
            const fps = this.frameCount / this.timeAccumulator;
            this.renderer.updateFPS(fps);
            this.frameCount = 0;
            this.timeAccumulator = 0;
        }
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
        const r = CONFIG.SNAKE.CIRCLE_RADIUS + CONFIG.SNAKE.SAFETY_MARGIN;

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

        // Update entities
        const gridDt = Math.min(dt, 0.1);
        // Avoid large delta spikes for logic spawn
        this.grid.update(gridDt, this.snake.getPath());
        this.background.update(dt);
        this.snake.animate(dt);
        this.particles.update(dt);

        // Fruit Collection
        const newHeadPos = this.snake.getHeadPosition();
        if (this.grid.handleFruitCollection(newHeadPos.x, newHeadPos.z, r)) {
            this.audio.playEatSound();
            this.snake.triggerEat();
            this.particles.spawnBurst(newHeadPos.x, newHeadPos.z);
        }

        // Button effects (XYAB / 1234)
        const buttonEffect = this.input.getButtonEffect();
        if (buttonEffect) {
            this.audio.playButtonSound(buttonEffect);
            this.particles.spawnButtonEffect(newHeadPos.x, newHeadPos.z, buttonEffect);
        }

        // Start background music on first input (user gesture required for AudioContext)
        if (!this.musicStarted && (direction.x !== 0 || direction.y !== 0 || buttonEffect)) {
            this.audio.startBackgroundMusic();
            this.musicStarted = true;
        }

        // Clear per-frame input state
        this.input.endFrame();
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
