

export const CONFIG = {
    GRID: {
        CELL_SIZE: 1.0, // World units
        FIXED_SIDE: 20, // One dimension is 100 units
        TARGET_OBSTACLE_DENSITY: 0.1, // 10%
    },
    SNAKE: {
        INITIAL_LENGTH: 5,
        SPEED: 15.0, // Units per second
        CIRCLE_RADIUS: 0.4,
        PULSE_SPEED: 5.0,
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
    FRUIT: {
        SIZE_CELLS: 3,
        TARGET_COUNT: 5,
    },
    CAMERA: {
        FOV: 60,
        HEIGHT_OFFSET: 100, // Distance from grid to fit 100 units (approx 50 / tan(30) = 86.6)
        LOOK_AT_OFFSET: 0,
    }
};
