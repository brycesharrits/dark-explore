/**
 * PowerUpManager - Manages power-up spawning and collection
 * Power-ups provide temporary buffs to players
 */
export class PowerUpManager {
    constructor(scene) {
        this.scene = scene;
        this.powerUps = []; // Array of power-up objects
        this.respawnDelay = 20000; // 20 seconds respawn time

        // Power-up types and their spawn weights
        this.powerUpTypes = [
            { type: 'speed', weight: 0.70 },      // 70% chance - speed boost
            { type: 'fullvision', weight: 0.20 }, // 20% chance - full vision
            { type: 'timewarp', weight: 0.10 }    // 10% chance - time warp (rare!)
        ];

        console.log('[PowerUpManager] Initialized');
    }

    /**
     * Spawn power-ups at random locations
     * @param {number} count - Number of power-ups to spawn
     */
    spawnPowerUps(count) {
        console.log(`[PowerUpManager] Spawning ${count} power-ups...`);

        const worldWidth = this.scene.gridWidth * this.scene.tileSize;
        const worldHeight = this.scene.gridHeight * this.scene.tileSize;
        const padding = this.scene.tileSize * 3;
        const powerUpRadius = 12; // sprite half-width

        for (let i = 0; i < count; i++) {
            // Generate random position fully inside the reachable area
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

            // Select random power-up type (weighted)
            const powerUpType = this.selectRandomType();

            // Create power-up sprite with icon
            const sprite = this.createPowerUpSprite(x, y, powerUpType, i);

            // Create power-up object
            const powerUp = {
                id: i,
                type: powerUpType,
                sprite: sprite,
                initialX: x,
                initialY: y,
                state: 'ACTIVE', // 'ACTIVE' | 'COLLECTED'
                respawnTimer: 0
            };

            this.powerUps.push(powerUp);
            console.log(`[PowerUpManager] Spawned ${powerUpType} power-up at (${x}, ${y})`);
        }

        console.log(`[PowerUpManager] Total power-ups: ${this.powerUps.length}`);
    }

    /**
     * Create power-up sprite with icon
     */
    createPowerUpSprite(x, y, type, id) {
        const graphics = this.scene.make.graphics({ x: 0, y: 0, add: false });

        // Blue circle background for all power-ups
        graphics.fillStyle(0x0088ff, 1); // Bright blue
        graphics.fillCircle(12, 12, 10);
        graphics.lineStyle(2, 0x0044aa, 1); // Dark blue border
        graphics.strokeCircle(12, 12, 10);

        // Draw icon based on type
        if (type === 'speed') {
            // Lightning bolt icon for speed
            graphics.fillStyle(0xffff00, 1); // Yellow lightning
            graphics.beginPath();
            graphics.moveTo(14, 6);
            graphics.lineTo(10, 12);
            graphics.lineTo(12, 12);
            graphics.lineTo(10, 18);
            graphics.lineTo(14, 12);
            graphics.lineTo(12, 12);
            graphics.closePath();
            graphics.fillPath();
        } else if (type === 'timewarp') {
            // Clock/stopwatch icon for time warp
            graphics.fillStyle(0xffffff, 1); // White clock
            graphics.lineStyle(1.5, 0xffffff, 1);
            graphics.strokeCircle(12, 12, 5); // Clock face

            // Clock hands
            graphics.beginPath();
            graphics.moveTo(12, 12);
            graphics.lineTo(12, 8); // Hour hand (up)
            graphics.stroke();

            graphics.beginPath();
            graphics.moveTo(12, 12);
            graphics.lineTo(15, 12); // Minute hand (right)
            graphics.stroke();
        } else if (type === 'fullvision') {
            // Eye icon for full vision
            graphics.fillStyle(0xffffff, 1); // White eye

            // Eye outline (ellipse)
            graphics.fillEllipse(12, 12, 10, 6);

            // Pupil (dark circle)
            graphics.fillStyle(0x0088ff, 1); // Blue pupil
            graphics.fillCircle(12, 12, 3);

            // Highlight (small white dot)
            graphics.fillStyle(0xffffff, 1);
            graphics.fillCircle(13, 11, 1);
        }

        // Generate unique texture
        const textureName = `powerup-${type}-${id}`;
        graphics.generateTexture(textureName, 24, 24);
        graphics.destroy();

        // Create sprite
        const sprite = this.scene.physics.add.sprite(x, y, textureName);
        sprite.setPipeline('Light2D');
        sprite.setDepth(15); // Above pickups

        return sprite;
    }

    /**
     * Select random power-up type based on weights
     */
    selectRandomType() {
        const totalWeight = this.powerUpTypes.reduce((sum, type) => sum + type.weight, 0);
        let random = Math.random() * totalWeight;

        for (const powerUpType of this.powerUpTypes) {
            random -= powerUpType.weight;
            if (random <= 0) {
                return powerUpType.type;
            }
        }

        // Fallback to first type
        return this.powerUpTypes[0].type;
    }

    /**
     * Collect a power-up (apply effect and hide it)
     * @param {Sprite} sprite - The power-up sprite
     * @param {BasePlayer} player - The player who collected it
     */
    collectPowerUp(sprite, player) {
        const powerUp = this.powerUps.find(p => p.sprite === sprite);
        if (!powerUp || powerUp.state !== 'ACTIVE') {
            return;
        }

        console.log(`[PowerUpManager] ${player.name} collected ${powerUp.type} power-up`);

        // Apply power-up effect
        this.applyPowerUpEffect(powerUp.type, player);

        // Change state to collected
        powerUp.state = 'COLLECTED';
        powerUp.respawnTimer = this.respawnDelay;

        // Hide sprite
        powerUp.sprite.setVisible(false);
        powerUp.sprite.body.enable = false;
    }

    /**
     * Apply power-up effect to player
     */
    applyPowerUpEffect(type, player) {
        if (type === 'speed') {
            this.applySpeedBoost(player);
        } else if (type === 'timewarp') {
            this.applyTimeWarp(player);
        } else if (type === 'fullvision') {
            this.applyFullVision(player);
        }
    }

    /**
     * Apply speed boost effect (5 seconds, 1.5× speed)
     */
    applySpeedBoost(player) {
        const duration = 5000; // 5 seconds
        const speedMultiplier = 1.5;

        // Store original speed if not already boosted
        if (!player.speedBoostActive) {
            player.originalSpeed = player.speed;
        }

        // Apply speed boost
        player.speed = player.originalSpeed * speedMultiplier;
        player.speedBoostActive = true;

        // Clear existing timer if any
        if (player.speedBoostTimer) {
            player.speedBoostTimer.remove();
        }

        // Set timer to remove boost
        player.speedBoostTimer = this.scene.time.delayedCall(duration, () => {
            player.speed = player.originalSpeed;
            player.speedBoostActive = false;
            console.log(`[PowerUpManager] Speed boost ended for ${player.name}`);
        });

        console.log(`[PowerUpManager] Speed boost applied to ${player.name} (${player.speed} speed for ${duration}ms)`);
    }

    /**
     * Apply time warp effect (7 seconds, slows everyone else to 40% speed)
     */
    applyTimeWarp(collector) {
        const duration = 7000; // 7 seconds
        const slowMultiplier = 0.4; // 40% speed

        // Get all alive players except the collector
        const alivePlayers = this.scene.playerManager.getAlivePlayers();
        const affectedPlayers = alivePlayers.filter(p => p !== collector);

        console.log(`[PowerUpManager] Time warp activated by ${collector.name} - affecting ${affectedPlayers.length} players`);

        // Show HUD indicator
        const hudScene = this.scene.scene.get('CaveHudScene');
        if (hudScene) {
            hudScene.showTimeWarpEffect(duration);
        }

        // Store affected players for timer reference
        const timeWarpData = {
            affectedPlayers: [],
            timer: null
        };

        // Apply slow effect to all other players
        affectedPlayers.forEach(player => {
            // Store original speed if not already slowed
            if (!player.timeWarpSlowed) {
                player.timeWarpOriginalSpeed = player.speed;
            }

            // Apply slow effect (20% of original speed)
            player.speed = player.timeWarpOriginalSpeed * slowMultiplier;
            player.timeWarpSlowed = true;

            // Track this player for restoration
            timeWarpData.affectedPlayers.push(player);
        });

        // Set timer to restore speeds
        timeWarpData.timer = this.scene.time.delayedCall(duration, () => {
            timeWarpData.affectedPlayers.forEach(player => {
                // Only restore if still slowed (player might have been eliminated)
                if (player.timeWarpSlowed && player.state === 'ALIVE') {
                    player.speed = player.timeWarpOriginalSpeed;
                    player.timeWarpSlowed = false;
                    console.log(`[PowerUpManager] Time warp ended for ${player.name} - speed restored to ${player.speed}`);
                }
            });

            // Hide HUD indicator
            const hudScene = this.scene.scene.get('CaveHudScene');
            if (hudScene) {
                hudScene.hideTimeWarpEffect();
            }

            console.log(`[PowerUpManager] Time warp effect ended`);
        });

        console.log(`[PowerUpManager] Time warp applied (${duration}ms) - ${affectedPlayers.length} players slowed to ${Math.round(slowMultiplier * 100)}% speed`);
    }

    /**
     * Apply full vision effect (10 seconds, removes darkness like testing mode)
     * Only works for the human player (has lantern light)
     */
    applyFullVision(player) {
        const duration = 10000; // 10 seconds

        // Only apply to human player (has the lantern light)
        if (!player.isHuman) {
            console.log(`[PowerUpManager] Full vision has no effect on bot ${player.name}`);
            return;
        }

        console.log(`[PowerUpManager] Full vision activated by ${player.name}`);

        // Clear any existing full vision effect first
        if (player.fullVisionTimer) {
            player.fullVisionTimer.remove();
            player.fullVisionTimer = null;
        }

        // Store original ambient color (always use scene's value)
        player.originalAmbientColor = this.scene.originalAmbientColor || 0x0a0a0a;

        // Apply full vision (brighten ambient light like testing mode)
        this.scene.lights.setAmbientColor(0xaaaaaa); // Bright gray - makes everything visible
        player.fullVisionActive = true;

        // Enable light radius indicator visualization (POWER-UP indicator, not debug)
        this.scene.fullVisionIndicatorActive = true;

        // Show HUD indicator
        const hudScene = this.scene.scene.get('CaveHudScene');
        if (hudScene) {
            hudScene.showFullVisionEffect(duration);
        }

        // Set timer to restore normal vision
        player.fullVisionTimer = this.scene.time.delayedCall(duration, () => {
            // ALWAYS restore state, regardless of player status
            this.endFullVisionEffect(player);
        });

        console.log(`[PowerUpManager] Full vision applied to ${player.name} (${duration}ms)`);
    }

    /**
     * End full vision effect and restore normal vision
     * Separated into its own method for proper cleanup
     */
    endFullVisionEffect(player) {
        if (!player || !player.fullVisionActive) {
            return; // Already ended or never started
        }

        console.log(`[PowerUpManager] Ending full vision for ${player.name}`);

        // Restore original ambient color (restore darkness)
        this.scene.lights.setAmbientColor(player.originalAmbientColor || 0x0a0a0a);

        // Disable light radius indicator
        this.scene.fullVisionIndicatorActive = false;

        // Clear player state
        player.fullVisionActive = false;
        if (player.fullVisionTimer) {
            player.fullVisionTimer.remove();
            player.fullVisionTimer = null;
        }

        // Hide HUD indicator
        const hudScene = this.scene.scene.get('CaveHudScene');
        if (hudScene) {
            hudScene.hideFullVisionEffect();
        }

        console.log(`[PowerUpManager] Full vision ended for ${player.name}`);
    }

    /**
     * Update power-ups (handle respawn timers)
     */
    update(delta) {
        this.powerUps.forEach(powerUp => {
            if (powerUp.state === 'COLLECTED') {
                powerUp.respawnTimer -= delta;

                if (powerUp.respawnTimer <= 0) {
                    this.respawnPowerUp(powerUp);
                }
            } else if (powerUp.state === 'ACTIVE') {
                // Pulse animation
                this.updatePulseAnimation(powerUp, delta);
            }
        });
    }

    /**
     * Respawn a collected power-up
     */
    respawnPowerUp(powerUp) {
        console.log(`[PowerUpManager] Respawning ${powerUp.type} power-up ${powerUp.id}`);

        powerUp.state = 'ACTIVE';
        powerUp.respawnTimer = 0;

        powerUp.sprite.setVisible(true);
        powerUp.sprite.body.enable = true;
        powerUp.sprite.setPosition(powerUp.initialX, powerUp.initialY);
        powerUp.sprite.setScale(1);
        powerUp.sprite.setAlpha(1);
    }

    /**
     * Pulse animation for active power-ups
     */
    updatePulseAnimation(powerUp, delta) {
        const pulseSpeed = 0.004; // Slightly faster than oil pickups
        const pulseAmount = 0.2; // More pronounced pulse

        if (!powerUp.pulseTime) {
            powerUp.pulseTime = 0;
        }

        powerUp.pulseTime += delta * pulseSpeed;
        const pulse = Math.sin(powerUp.pulseTime) * pulseAmount;
        const scale = 1 + pulse;

        powerUp.sprite.setScale(scale);
    }

    /**
     * Get all active power-up sprites for collision detection
     */
    getActiveSprites() {
        return this.powerUps
            .filter(p => p.state === 'ACTIVE')
            .map(p => p.sprite);
    }
}
