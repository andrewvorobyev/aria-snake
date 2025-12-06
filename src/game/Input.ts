export class Input {
    private keys: Set<string> = new Set();

    constructor() {
        window.addEventListener('keydown', (e) => {
            this.keys.add(e.code);
            if (e.code === 'KeyF') {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(err => {
                        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
                    });
                } else {
                    document.exitFullscreen();
                }
            }
        });
        window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    }

    public getDirection(): { x: number, y: number } {
        let dx = 0;
        let dy = 0;

        // Gamepad Priority
        const gamepad = navigator.getGamepads()[0];
        if (gamepad) {
            const axisX = gamepad.axes[0];
            const axisY = gamepad.axes[1];

            // Deadzone
            if (Math.abs(axisX) > 0.1 || Math.abs(axisY) > 0.1) {
                const len = Math.sqrt(axisX * axisX + axisY * axisY);
                return { x: axisX / len, y: axisY / len };
            }
        }

        // Keyboard
        if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) dy = -1;
        if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) dy = 1;
        if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) dx = -1;
        if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) dx = 1;

        if (dx !== 0 || dy !== 0) {
            // Normalize input
            const len = Math.sqrt(dx * dx + dy * dy);
            return { x: dx / len, y: dy / len };
        }

        return { x: 0, y: 0 };
    }
}
