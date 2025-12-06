import { defineConfig } from 'vite';

export default defineConfig({
    base: './', // Use relative paths for assets to ensure they load correctly on GitHub Pages
    build: {
        outDir: 'dist',
    }
});
