export type ButtonEffect = 'X' | 'Y' | 'A' | 'B' | null;

export class Input {
    private keys: Set<string> = new Set();
    private pressedThisFrame: Set<string> = new Set();
    private gamepadButtonsPressed: Set<number> = new Set();

    constructor() {
        window.addEventListener('keydown', (e) => {
            if (!this.keys.has(e.code)) {
                this.pressedThisFrame.add(e.code);
            }
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

        // Gamepad - check both left and right sticks
        const gamepad = navigator.getGamepads()[0];
        if (gamepad) {
            // Left stick (axes 0, 1)
            let axisX = gamepad.axes[0];
            let axisY = gamepad.axes[1];

            // Right stick (axes 2, 3) - use if left stick isn't active
            const rightX = gamepad.axes[2];
            const rightY = gamepad.axes[3];

            // Use whichever stick has more input
            const leftMag = Math.sqrt(axisX * axisX + axisY * axisY);
            const rightMag = Math.sqrt(rightX * rightX + rightY * rightY);

            if (rightMag > leftMag && rightMag > 0.1) {
                axisX = rightX;
                axisY = rightY;
            }

            // Deadzone
            if (Math.abs(axisX) > 0.1 || Math.abs(axisY) > 0.1) {
                const len = Math.sqrt(axisX * axisX + axisY * axisY);
                return { x: axisX / len, y: axisY / len };
            }
        }

        // Keyboard - Arrow keys only (WASD is for effects)
        if (this.keys.has('ArrowUp')) dy = -1;
        if (this.keys.has('ArrowDown')) dy = 1;
        if (this.keys.has('ArrowLeft')) dx = -1;
        if (this.keys.has('ArrowRight')) dx = 1;

        if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            return { x: dx / len, y: dy / len };
        }

        return { x: 0, y: 0 };
    }

    /**
     * Check for button effect triggers (XYAB on controller, 1234 on keyboard)
     * Returns null if no button was pressed this frame
     */
    public getButtonEffect(): ButtonEffect {
        // Check keyboard - WASD or 1234 keys
        // W/1 = X (blue), A/2 = Y (yellow), S/3 = A (green), D/4 = B (red)
        if (this.pressedThisFrame.has('KeyW') || this.pressedThisFrame.has('Digit1')) return 'X';
        if (this.pressedThisFrame.has('KeyA') || this.pressedThisFrame.has('Digit2')) return 'Y';
        if (this.pressedThisFrame.has('KeyS') || this.pressedThisFrame.has('Digit3')) return 'A';
        if (this.pressedThisFrame.has('KeyD') || this.pressedThisFrame.has('Digit4')) return 'B';

        // Check gamepad buttons
        const gamepad = navigator.getGamepads()[0];
        if (gamepad) {
            // Xbox controller: X=2, Y=3, A=0, B=1
            const buttonMap: [number, ButtonEffect][] = [
                [2, 'X'], // X button
                [3, 'Y'], // Y button
                [0, 'A'], // A button
                [1, 'B'], // B button
            ];

            for (const [btnIndex, effect] of buttonMap) {
                const pressed = gamepad.buttons[btnIndex]?.pressed;
                const wasPressed = this.gamepadButtonsPressed.has(btnIndex);

                if (pressed && !wasPressed) {
                    this.gamepadButtonsPressed.add(btnIndex);
                    return effect;
                } else if (!pressed && wasPressed) {
                    this.gamepadButtonsPressed.delete(btnIndex);
                }
            }
        }

        return null;
    }

    /**
     * Call at end of frame to clear pressed-this-frame state
     */
    public endFrame() {
        this.pressedThisFrame.clear();
    }
}
