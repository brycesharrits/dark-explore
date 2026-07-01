export const SERVER_CONFIG = {
    PORT: 3001,

    // Room settings
    ROOM_CAPACITY: 10,       // max human players per room
    BOT_FILL_TO: 10,         // always fill to exactly 10 total (humans + bots)
    COUNTDOWN_SECONDS: 5,    // lobby countdown before game starts

    // Tick rate
    TICK_RATE: 20,
    TICK_INTERVAL_MS: 50,    // 1000 / TICK_RATE

    // World
    TILE_SIZE: 32,
    GRID_WIDTH: 80,
    GRID_HEIGHT: 80,

    // Oil system (must match BasePlayer.oilDepletionRate)
    OIL_DEPLETION_RATE: 5,   // units per second
    MAX_OIL: 100,
    OIL_AMOUNT: 25,          // per pickup
    OIL_RESPAWN_DELAY: 16500, // ms

    // Power-ups (speed boost only)
    POWER_UP_RESPAWN_DELAY: 20000, // ms
    SPEED_BOOST_MULTIPLIER: 1.8,
    SPEED_BOOST_DURATION: 8000,    // ms

    // Spawns
    PICKUP_COUNT: 27,
    POWER_UP_COUNT: 6,
    ENEMY_COUNT: 15,
    ENEMY_SPAWN_DELAY: 5000, // ms

    // Physics
    PLAYER_SPEED: 150,
    PLAYER_RADIUS: 14,
    ENEMY_SPEED: 60,
    ENEMY_RADIUS: 16,

    // Enemy direction change interval
    ENEMY_TURN_INTERVAL: 2000, // ms

    // Bot AI
    BOT_UPDATE_INTERVAL: 300,  // ms between bot decisions
    BOT_SMART_RATIO: 0.3,
};
