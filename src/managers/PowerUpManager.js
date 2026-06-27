/**
 * PowerUpManager - Manages speed-boost power-up spawning, collection, and respawn.
 * In MP mode the server is authoritative for placement and effect timing;
 * the client mirrors visual state from server snapshots.
 */
export class PowerUpManager {
    constructor(scene) {
        this.scene = scene;
        this.powerUps = []; // Array of power-up objects
        this.respawnDelay = 20000; // 20 seconds respawn time (solo mode)

        console.log('[PowerUpManager] Initialized');
    }

    /**
     * Spawn power-ups at random reachable locations (solo mode).
     * @param {number} count - Number of power-ups to spawn
     */
    spawnPowerUps(count) {
        const worldWidth = this.scene.gridWidth * this.scene.tileSize;
        const worldHeight = this.scene.gridHeight * this.scene.tileSize;
        const padding = this.scene.tileSize * 3;
        const powerUpRadius = 12;

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            let valid = false;
            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                attempts++;
                if (this.scene.isFootprintReachable(x, y, powerUpRadius)) {
                    valid = true;
                    break;
                }
            } while (attempts < 500);

            if (!valid) continue;

            this._addPowerUp(i, x, y);
        }

        console.log(`[PowerUpManager] Total power-ups: ${this.powerUps.length}`);
    }

    /**
     * Spawn power-ups at server-provided positions (multiplayer mode).
     * @param {Array} positions - [{id, x, y, type}, ...]
     */
    spawnAtPositions(positions) {
        if (!positions) return;
        for (const pos of positions) {
            this._addPowerUp(pos.id, pos.x, pos.y);
        }
        console.log(`[PowerUpManager] Total server power-ups: ${this.powerUps.length}`);
    }

    _addPowerUp(id, x, y) {
        const sprite = this._createSprite(x, y, id);
        this.powerUps.push({
            id,
            sprite,
            initialX: x,
            initialY: y,
            state: 'ACTIVE',
            respawnTimer: 0
        });
    }

    /**
     * Create power-up sprite — blue circle with a yellow lightning bolt for speed.
     */
    _createSprite(x, y, id) {
        const graphics = this.scene.make.graphics({ x: 0, y: 0, add: false });

        graphics.fillStyle(0x0088ff, 1);
        graphics.fillCircle(12, 12, 10);
        graphics.lineStyle(2, 0x0044aa, 1);
        graphics.strokeCircle(12, 12, 10);

        // Lightning bolt
        graphics.fillStyle(0xffff00, 1);
        graphics.beginPath();
        graphics.moveTo(14, 6);
        graphics.lineTo(10, 12);
        graphics.lineTo(12, 12);
        graphics.lineTo(10, 18);
        graphics.lineTo(14, 12);
        graphics.lineTo(12, 12);
        graphics.closePath();
        graphics.fillPath();

        const textureName = `powerup-speed-${id}`;
        graphics.generateTexture(textureName, 24, 24);
        graphics.destroy();

        const sprite = this.scene.physics.add.sprite(x, y, textureName);
        sprite.setPipeline('Light2D');
        sprite.setDepth(15);
        return sprite;
    }

    /**
     * Collect a power-up (apply effect and hide it)
     */
    collectPowerUp(sprite, player) {
        const powerUp = this.powerUps.find(p => p.sprite === sprite);
        if (!powerUp || powerUp.state !== 'ACTIVE') return;

        console.log(`[PowerUpManager] ${player.name} collected speed power-up`);

        // Server is authoritative for speed in MP — local boost would race the snapshot.
        if (!this.scene.isMultiplayer) {
            this.applySpeedBoost(player);
        }

        powerUp.state = 'COLLECTED';
        powerUp.respawnTimer = this.respawnDelay;
        powerUp.sprite.setVisible(false);
        powerUp.sprite.body.enable = false;
    }

    /**
     * Speed boost effect (solo mode only). 5s at 1.5× speed.
     */
    applySpeedBoost(player) {
        const duration = 5000;
        const speedMultiplier = 1.5;

        if (!player.speedBoostActive) {
            player.originalSpeed = player.speed;
        }
        player.speed = player.originalSpeed * speedMultiplier;
        player.speedBoostActive = true;

        if (player.speedBoostTimer) {
            player.speedBoostTimer.remove();
        }
        player.speedBoostTimer = this.scene.time.delayedCall(duration, () => {
            player.speed = player.originalSpeed;
            player.speedBoostActive = false;
        });
    }

    /**
     * Update power-ups (solo respawn timers + pulse animation).
     */
    update(delta) {
        this.powerUps.forEach(powerUp => {
            if (powerUp.state === 'COLLECTED') {
                powerUp.respawnTimer -= delta;
                if (powerUp.respawnTimer <= 0) {
                    this.respawnPowerUp(powerUp);
                }
            } else if (powerUp.state === 'ACTIVE') {
                this.updatePulseAnimation(powerUp, delta);
            }
        });
    }

    respawnPowerUp(powerUp) {
        powerUp.state = 'ACTIVE';
        powerUp.respawnTimer = 0;
        powerUp.sprite.setVisible(true);
        powerUp.sprite.body.enable = true;
        powerUp.sprite.setPosition(powerUp.initialX, powerUp.initialY);
        powerUp.sprite.setScale(1);
        powerUp.sprite.setAlpha(1);
    }

    updatePulseAnimation(powerUp, delta) {
        const pulseSpeed = 0.004;
        const pulseAmount = 0.2;
        if (!powerUp.pulseTime) powerUp.pulseTime = 0;
        powerUp.pulseTime += delta * pulseSpeed;
        const scale = 1 + Math.sin(powerUp.pulseTime) * pulseAmount;
        powerUp.sprite.setScale(scale);
    }

    getActiveSprites() {
        return this.powerUps.filter(p => p.state === 'ACTIVE').map(p => p.sprite);
    }

    /**
     * Apply a server-side state change for a specific power-up (MP mode).
     * Called when a dirty power-up update arrives in world_snapshot.
     */
    applyServerState(id, state) {
        const powerUp = this.powerUps.find(p => p.id === id);
        if (!powerUp) return;

        if (state === 'COLLECTED' && powerUp.state === 'ACTIVE') {
            powerUp.state = 'COLLECTED';
            powerUp.sprite.setVisible(false);
            powerUp.sprite.body.enable = false;
        } else if (state === 'ACTIVE' && powerUp.state === 'COLLECTED') {
            powerUp.state = 'ACTIVE';
            powerUp.sprite.setVisible(true);
            powerUp.sprite.body.enable = true;
            powerUp.sprite.setPosition(powerUp.initialX, powerUp.initialY);
            powerUp.sprite.setScale(1);
            powerUp.sprite.setAlpha(1);
        }
    }
}
