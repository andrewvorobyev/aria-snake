
export const CONFIG = {
    GRID: {
        CELL_SIZE: 1.0, // World units
        FIXED_SIDE: 20, // One dimension is 100 units
        TARGET_OBSTACLE_DENSITY: 0.05, // 10%
    },
    SNAKE: {
        INITIAL_LENGTH: 20,
        SPEED: 10,
        CIRCLE_RADIUS: 0.65, // Radius of the snake's body segments
        PULSE_SPEED: 4.0, // Speed of the pulsing animation
        PULSE_AMPLITUDE: 0.05, // Amplitude of body size fluctuation
        HEAD_COLOR: 0x00ff00, // Green
        BODY_COLOR: 0x44aa44,
        EYE_COLOR: 0xffffff,
        PUPIL_COLOR: 0x000000,
    },
    COLORS: {
        BACKGROUND: 0x111111,
        GRID_LINES: 0x333333,
        OBSTACLE: 0xff4444, // Red blocks
        FRUIT: 0xffaa00, // Orange fruit
    },
    ORGANISMS: {
        COUNT: 10,
        BLOB_COUNT: { MIN: 2, MAX: 12 },
        RADIUS: { MIN: 0.4, MAX: 1.3 },
        SPACING: { MIN: 0.5, MAX: 1.8 },
        SPEED: { MIN: 0.03, MAX: 0.05 },
        LEADER_CHANGE_INTERVAL: { MIN: 2.0, MAX: 6.0 },
        EYE_COUNT: { MIN: 1, MAX: 3 },
        EYES: {
            WANDER_SPEED: 0.0075, // Lower = Slower
            PUPIL_SPEED: 0.15,
            BLINK_INTERVAL: { MIN: 2.0, MAX: 8.0 }
        }
    },
    FRUIT: {
        SIZE_CELLS: 3,
        TARGET_COUNT: 5,
    },
    CAMERA: {
        FOV: 60,
        HEIGHT_OFFSET: 100, // Distance from grid to fit 100 units (approx 50 / tan(30) = 86.6)
        LOOK_AT_OFFSET: 0,
    },
    VIGNETTE: {
        RADIUS_START: 0.6,
        RADIUS_END: 1.3,
        DARKNESS: 0.4, // Lower is darker
    }
};
