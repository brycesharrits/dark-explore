import { SERVER_CONFIG } from '../config/ServerConfig.js';

const {
    OIL_RESPAWN_DELAY, POWER_UP_RESPAWN_DELAY, OIL_AMOUNT,
    SPEED_BOOST_MULTIPLIER, SPEED_BOOST_DURATION,
    FULL_VISION_DURATION, TIMEWARP_SLOW, TIMEWARP_DURATION,
    ENEMY_COUNT, ENEMY_SPEED, ENEMY_RADIUS, PLAYER_RADIUS,
    TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, ENEMY_TURN_INTERVAL
} = SERVER_CONFIG;

export class ServerGameState {
    constructor(worldData) {
        // Pickups
        this.oilPickups = worldData.oilPickups.map(p => ({
            ...p,
            state: 'ACTIVE',
            respawnAt: 0
        }));

        this.powerUps = worldData.powerUps.map(p => ({
            ...p,
            state: 'ACTIVE',
            respawnAt: 0,
            activePowerUpId: null // tracks which active power-up effect this generated
        }));

        // Dirty tracking for delta snapshots
        this.dirtyPickups = new Set();
        this.dirtyPowerUps = new Set();

        // Players map: id -> ServerPlayerState
        this.players = new Map();

        // Alive count
        this.aliveCount = 0;

        // Active power-up effects: [{powerUpId, type, collectorId, expiresAt, affectedIds}]
        this.activePowerUpEffects = [];

        // Wall grid (for collision checks)
        this.wallGrid = worldData.wallGrid;

        // Enemies
        this.enemies = this._spawnEnemies(worldData);

        // Tick counter
        this.tick = 0;
        this.startTime = Date.now();
    }

    // -----------------------------------------------------------------------
    // Player management
    // -----------------------------------------------------------------------

    addPlayer(playerState) {
        this.players.set(playerState.id, playerState);
        if (playerState.isAlive()) this.aliveCount++;
    }

    removePlayer(id) {
        const p = this.players.get(id);
        if (p && p.isAlive()) this.aliveCount--;
        this.players.delete(id);
    }

    getAlivePlayers() {
        return Array.from(this.players.values()).filter(p => p.isAlive());
    }

    getAllPlayers() {
        return Array.from(this.players.values());
    }

    // -----------------------------------------------------------------------
    // Pickup collection checks
    // -----------------------------------------------------------------------

    checkPickupCollisions(player) {
        const events = [];

        for (const pickup of this.oilPickups) {
            if (pickup.state !== 'ACTIVE') continue;
            const dx = player.x - pickup.x;
            const dy = player.y - pickup.y;
            if (dx * dx + dy * dy < (PLAYER_RADIUS + 8) ** 2) {
                pickup.state = 'COLLECTED';
                pickup.respawnAt = Date.now() + OIL_RESPAWN_DELAY;
                this.dirtyPickups.add(pickup.id);

                player.oil = Math.min(SERVER_CONFIG.MAX_OIL, player.oil + OIL_AMOUNT);

                events.push({
                    type: 'pickup_collected',
                    pickupId: pickup.id,
                    collectorId: player.id,
                    oilGranted: OIL_AMOUNT
                });
            }
        }

        for (const powerUp of this.powerUps) {
            if (powerUp.state !== 'ACTIVE') continue;
            const dx = player.x - powerUp.x;
            const dy = player.y - powerUp.y;
            if (dx * dx + dy * dy < (PLAYER_RADIUS + 10) ** 2) {
                powerUp.state = 'COLLECTED';
                powerUp.respawnAt = Date.now() + POWER_UP_RESPAWN_DELAY;
                this.dirtyPowerUps.add(powerUp.id);

                const effectEvent = this._applyPowerUp(powerUp, player);
                events.push(effectEvent);
            }
        }

        return events;
    }

    _applyPowerUp(powerUp, collector) {
        const now = Date.now();
        let effect = {
            type: 'powerup_collected',
            powerUpId: powerUp.id,
            collectorId: collector.id,
            powerUpType: powerUp.type,
            affectedPlayerIds: []
        };

        if (powerUp.type === 'speed') {
            collector.speedBoostActive = true;
            collector.speedBoostTimer = SPEED_BOOST_DURATION;
            effect.duration = SPEED_BOOST_DURATION;

        } else if (powerUp.type === 'fullvision') {
            effect.duration = FULL_VISION_DURATION;
            // Purely cosmetic — client handles visuals
            this.activePowerUpEffects.push({
                powerUpId: powerUp.id,
                type: 'fullvision',
                collectorId: collector.id,
                expiresAt: now + FULL_VISION_DURATION
            });

        } else if (powerUp.type === 'timewarp') {
            const affected = this.getAlivePlayers()
                .filter(p => p.id !== collector.id)
                .map(p => p.id);

            affected.forEach(id => {
                const p = this.players.get(id);
                if (p) {
                    p.timeWarpSlowActive = true;
                    p.timeWarpSlowTimer = TIMEWARP_DURATION;
                }
            });

            effect.duration = TIMEWARP_DURATION;
            effect.affectedPlayerIds = affected;

            this.activePowerUpEffects.push({
                powerUpId: powerUp.id,
                type: 'timewarp',
                collectorId: collector.id,
                expiresAt: now + TIMEWARP_DURATION,
                affectedIds: affected
            });
        }

        return effect;
    }

    // -----------------------------------------------------------------------
    // Pickup respawn
    // -----------------------------------------------------------------------

    updatePickupRespawns() {
        const now = Date.now();
        const events = [];

        for (const pickup of this.oilPickups) {
            if (pickup.state === 'COLLECTED' && now >= pickup.respawnAt) {
                pickup.state = 'ACTIVE';
                this.dirtyPickups.add(pickup.id);
            }
        }

        for (const powerUp of this.powerUps) {
            if (powerUp.state === 'COLLECTED' && now >= powerUp.respawnAt) {
                powerUp.state = 'ACTIVE';
                this.dirtyPowerUps.add(powerUp.id);
            }
        }

        // Check power-up effect expirations
        const remaining = [];
        for (const effect of this.activePowerUpEffects) {
            if (now >= effect.expiresAt) {
                events.push({ type: 'powerup_expired', powerUpId: effect.powerUpId, powerUpType: effect.type, affectedPlayerIds: effect.affectedIds || [] });
            } else {
                remaining.push(effect);
            }
        }
        this.activePowerUpEffects = remaining;

        return events;
    }

    // -----------------------------------------------------------------------
    // Player power-up timers
    // -----------------------------------------------------------------------

    updatePlayerPowerUpTimers(player, dtMs) {
        if (player.speedBoostActive) {
            player.speedBoostTimer -= dtMs;
            if (player.speedBoostTimer <= 0) {
                player.speedBoostActive = false;
                player.speedBoostTimer = 0;
            }
        }
        if (player.timeWarpSlowActive) {
            player.timeWarpSlowTimer -= dtMs;
            if (player.timeWarpSlowTimer <= 0) {
                player.timeWarpSlowActive = false;
                player.timeWarpSlowTimer = 0;
            }
        }
    }

    // -----------------------------------------------------------------------
    // Enemy check
    // -----------------------------------------------------------------------

    checkEnemyCollisions(player) {
        for (const enemy of this.enemies) {
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            if (dx * dx + dy * dy < (PLAYER_RADIUS + ENEMY_RADIUS) ** 2) {
                return true;
            }
        }
        return false;
    }

    // -----------------------------------------------------------------------
    // Enemy update
    // -----------------------------------------------------------------------

    updateEnemies(dtMs) {
        const dt = dtMs / 1000;
        for (const enemy of this.enemies) {
            enemy.directionTimer -= dtMs;
            if (enemy.directionTimer <= 0) {
                // Pick a new random direction
                const angle = Math.random() * Math.PI * 2;
                enemy.vx = Math.cos(angle) * ENEMY_SPEED;
                enemy.vy = Math.sin(angle) * ENEMY_SPEED;
                enemy.directionTimer = ENEMY_TURN_INTERVAL + Math.random() * 1000;
            }

            // Move
            enemy.x += enemy.vx * dt;
            enemy.y += enemy.vy * dt;

            // Bounce off world bounds
            const worldW = GRID_WIDTH * TILE_SIZE;
            const worldH = GRID_HEIGHT * TILE_SIZE;
            if (enemy.x < ENEMY_RADIUS || enemy.x > worldW - ENEMY_RADIUS) {
                enemy.vx *= -1;
                enemy.x = Math.max(ENEMY_RADIUS, Math.min(worldW - ENEMY_RADIUS, enemy.x));
            }
            if (enemy.y < ENEMY_RADIUS || enemy.y > worldH - ENEMY_RADIUS) {
                enemy.vy *= -1;
                enemy.y = Math.max(ENEMY_RADIUS, Math.min(worldH - ENEMY_RADIUS, enemy.y));
            }

            // Simple wall bounce
            if (this.wallGrid && this._isWall(enemy.x, enemy.y)) {
                enemy.vx *= -1;
                enemy.vy *= -1;
                enemy.x += enemy.vx * dt * 2;
                enemy.y += enemy.vy * dt * 2;
            }
        }
    }

    _isWall(x, y) {
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return true;
        return this.wallGrid[ty * GRID_WIDTH + tx] === 1;
    }

    _spawnEnemies(worldData) {
        const enemies = [];
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const spawns = worldData.playerSpawns;

        // Spread enemies in areas away from center spawn
        for (let i = 0; i < ENEMY_COUNT; i++) {
            let x, y, attempts = 0;
            do {
                x = Math.random() * worldW;
                y = Math.random() * worldH;
                attempts++;
                const onWall = this._isWall(x, y);
                if (!onWall) break;
            } while (attempts < 100);

            const angle = Math.random() * Math.PI * 2;
            enemies.push({
                id: i,
                x, y,
                vx: Math.cos(angle) * ENEMY_SPEED,
                vy: Math.sin(angle) * ENEMY_SPEED,
                directionTimer: Math.random() * ENEMY_TURN_INTERVAL
            });
        }

        return enemies;
    }

    // -----------------------------------------------------------------------
    // Snapshot construction
    // -----------------------------------------------------------------------

    buildSnapshot() {
        this.tick++;
        const snapshot = {
            tick: this.tick,
            timestamp: Date.now(),
            players: Array.from(this.players.values()).map(p => p.toSnapshotEntry())
        };

        if (this.dirtyPickups.size > 0) {
            snapshot.oilPickups = Array.from(this.dirtyPickups).map(id => {
                const p = this.oilPickups[id];
                return { id: p.id, state: p.state, respawnAt: p.respawnAt };
            });
            this.dirtyPickups.clear();
        }

        if (this.dirtyPowerUps.size > 0) {
            snapshot.powerUps = Array.from(this.dirtyPowerUps).map(id => {
                const p = this.powerUps[id];
                return { id: p.id, state: p.state, respawnAt: p.respawnAt };
            });
            this.dirtyPowerUps.clear();
        }

        return snapshot;
    }
}
