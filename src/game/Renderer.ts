import * as THREE from 'three';
import { CONFIG } from '../constants';

export class Renderer {
    public scene: THREE.Scene;
    public camera: THREE.PerspectiveCamera;
    public renderer: THREE.WebGLRenderer;
    private container: HTMLElement;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId) as HTMLElement;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(CONFIG.COLORS.BACKGROUND);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);

        // Setup Camera
        // Initial setup, will be updated on resize
        const aspect = window.innerWidth / window.innerHeight;
        this.camera = new THREE.PerspectiveCamera(CONFIG.CAMERA.FOV, aspect, 0.1, 1000);
        this.camera.position.set(0, CONFIG.CAMERA.HEIGHT_OFFSET, 0);
        this.camera.up.set(0, 0, -1); // Orients -Z as "Up" on visual screen
        this.camera.lookAt(0, 0, 0);

        // Light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        this.scene.add(dirLight);

        // Resize Handler
        window.addEventListener('resize', this.onWindowResize.bind(this));
    }

    private onWindowResize() {
        if (!this.camera || !this.renderer) return;

        const width = window.innerWidth;
        const height = window.innerHeight;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        this.renderer.setSize(width, height);

        // Dispatch custom event for game logic to update grid
        window.dispatchEvent(new CustomEvent('game-resize', { detail: { aspect: width / height } }));
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

    public getAspectRatio(): number {
        return window.innerWidth / window.innerHeight;
    }
}
