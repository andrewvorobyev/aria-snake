import * as THREE from 'three';
import { CONFIG } from '../constants';

export class Renderer {
    public scene: THREE.Scene;
    public camera: THREE.OrthographicCamera;
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

        // Setup Camera (Orthographic)
        const aspect = window.innerWidth / window.innerHeight;
        const frustumSize = 20; // Initial default, will be resized
        this.camera = new THREE.OrthographicCamera(
            frustumSize * aspect / -2,
            frustumSize * aspect / 2,
            frustumSize / 2,
            frustumSize / -2,
            1,
            1000
        );

        // Top Down View
        this.camera.position.set(0, 100, 0);
        this.camera.up.set(0, 0, -1); // Orient -Z as Up
        this.camera.lookAt(0, 0, 0);

        // Light
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
        dirLight.position.set(50, 80, 50);
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

        this.renderer.setSize(width, height);
        // Cap pixel ratio at 1.5 for performance on Retina/High-DPI screens
        // The metaball shader is expensive (O(N) per pixel), so 4K+ rendering is too heavy.
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

        // Dispatch custom event for game logic to update grid
        window.dispatchEvent(new CustomEvent('game-resize', { detail: { aspect: width / height } }));
    }

    public fitCameraToGrid(gridHeight: number) {
        if (!this.camera) return;

        const aspect = window.innerWidth / window.innerHeight;

        // We want to fit 'gridHeight' (physical size) vertically + margin
        // In Ortho cam, 'top' - 'bottom' = visible vertical units.

        const viewSize = gridHeight; // 100% fit

        this.camera.left = -viewSize * aspect / 2;
        this.camera.right = viewSize * aspect / 2;
        this.camera.top = viewSize / 2;
        this.camera.bottom = -viewSize / 2;

        this.camera.updateProjectionMatrix();
    }

    public render() {
        this.renderer.render(this.scene, this.camera);
    }

    public getAspectRatio(): number {
        return window.innerWidth / window.innerHeight;
    }
}
