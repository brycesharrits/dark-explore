import { SERVER_CONFIG } from '../config/ServerConfig.js';

export class ServerPlayerState {
    constructor(id, name, x, y, isBot = false) {
        this.id = id;
        this.name = name;
        this.isBot = isBot;

        // Position
        this.x = x;
        this.y = y;

        // Stats
        this.state = 'ALIVE';   // 'ALIVE' | 'DEAD'
        this.oil = SERVER_CONFIG.MAX_OIL;
        this.speed = SERVER_CONFIG.PLAYER_SPEED;
        this.score = 0;
        this.scoreTimer = 0;
        this.survivalTime = 0;
        this.finalRank = null;

        // Active power-up effects
        this.speedBoostActive = false;
        this.speedBoostTimer = 0;
        this.timeWarpSlowActive = false;
        this.timeWarpSlowTimer = 0;

        // Client input (updated by incoming player_input events)
        this.pendingInput = { up: false, down: false, left: false, right: false };
        this.lastProcessedSeq = 0;

        // Bot AI state
        this.botUpdateTimer = 0;
        this.botDirection = { vx: 0, vy: 0 };
        this.botDirectionTimer = 0;
    }

    isAlive() {
        return this.state === 'ALIVE';
    }

    getEffectiveSpeed() {
        let s = this.speed;
        if (this.speedBoostActive) s *= SERVER_CONFIG.SPEED_BOOST_MULTIPLIER;
        if (this.timeWarpSlowActive) s *= SERVER_CONFIG.TIMEWARP_SLOW;
        return s;
    }

    toSnapshotEntry() {
        return {
            id: this.id,
            x: this.x,
            y: this.y,
            oil: this.oil,
            speed: this.getEffectiveSpeed(),
            score: this.score,
            state: this.state,
            lastInputSeq: this.lastProcessedSeq
        };
    }
}
