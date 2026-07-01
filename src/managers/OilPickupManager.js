/**
 * OilPickupManager - Manages oil pickups with respawn system
 * Pickups respawn after being collected to sustain longer gameplay
 */
export class OilPickupManager {
    constructor(scene) {
        this.scene = scene;
        this.pickups = []; // Array of pickup objects with state
        this.respawnDelay = 15000; // 15 seconds in milliseconds
        this.oilAmount = 25; // Amount of oil restored per pickup

        console.log('[OilPickupManager] Initialized');
    }

    /**
     * Spawn oil pickups at random locations
     * @param {number} count - Number of pickups to spawn
     */
    spawnPickups(count) {
        console.log(`[OilPickupManager] Spawning ${count} oil pickups...`);

        const worldWidth = this.scene.gridWidth * this.scene.tileSize;
        const worldHeight = this.scene.gridHeight * this.scene.tileSize;
        const padding = this.scene.tileSize * 2;
        const pickupRadius = 8; // sprite half-width

        for (let i = 0; i < count; i++) {
            // Generate random position fully inside the reachable area
            let x, y, attempts = 0;
            let valid = false;
            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                attempts++;
                if (this.scene.isFootprintReachable(x, y, pickupRadius)) {
                    valid = true;
                    break;
                }
            } while (attempts < 500);

            if (!valid) continue;

            const sprite = this._createSprite(x, y, i);

            const pickup = {
                id: i,
                sprite: sprite,
                initialX: x,
                initialY: y,
                state: 'ACTIVE', // 'ACTIVE' | 'COLLECTED'
                respawnTimer: 0,
                oilAmount: this.oilAmount
            };

            this.pickups.push(pickup);
            console.log(`[OilPickupManager] Spawned pickup ${i} at (${x}, ${y})`);
        }

        // Create Phaser group for collision detection
        this.createCollisionGroup();

        console.log(`[OilPickupManager] Total pickups: ${this.pickups.length}`);
    }

    /**
     * Draw the oil pickup — a tiny amber flask with a dark cap. Rendered with
     * Light2D so the lantern reveals it on approach; intentionally no light
     * source of its own so pickups don't telegraph their position in the dark.
     */
    _createSprite(x, y, id) {
        const textureName = `oil-pickup-${id}`;
        if (!this.scene.textures.exists(textureName)) {
            const g = this.scene.make.graphics({ x: 0, y: 0, add: false });

            // Bottle body (amber)
            g.fillStyle(0xff8c1a, 1);
            g.fillRoundedRect(3, 4, 10, 11, 2);
            // Darker amber toward the bottom — gives liquid weight
            g.fillStyle(0xc25a00, 1);
            g.fillRoundedRect(3, 10, 10, 5, 2);
            // Bottle outline
            g.lineStyle(1, 0x140804, 1);
            g.strokeRoundedRect(3, 4, 10, 11, 2);

            // Left-edge highlight (specular reflection on glass)
            g.fillStyle(0xffd57a, 1);
            g.fillRect(4, 6, 1, 5);
            g.fillStyle(0xffffff, 0.9);
            g.fillRect(4, 6, 1, 2);

            // Neck and cap
            g.fillStyle(0x3a2818, 1);
            g.fillRect(6, 3, 4, 1);
            g.fillStyle(0x1f1a14, 1);
            g.fillRect(6, 1, 4, 2);
            g.fillStyle(0x6a6a6a, 1);
            g.fillRect(7, 1, 1, 1);

            g.generateTexture(textureName, 16, 16);
            g.destroy();
        }

        const sprite = this.scene.physics.add.sprite(x, y, textureName);
        sprite.setPipeline('Light2D');
        sprite.setDepth(10);
        return sprite;
    }

    /**
     * Create Phaser group for collision detection
     */
    createCollisionGroup() {
        const activeSprites = this.pickups
            .filter(p => p.state === 'ACTIVE')
            .map(p => p.sprite);

        this.collisionGroup = this.scene.physics.add.group(activeSprites);
    }

    /**
     * Get all active pickup sprites for collision detection
     */
    getActiveSprites() {
        return this.pickups
            .filter(p => p.state === 'ACTIVE')
            .map(p => p.sprite);
    }

    /**
     * Collect a pickup (hide it and start respawn timer)
     * @param {Sprite} sprite - The pickup sprite that was collected
     * @param {BasePlayer} player - The player who collected it
     */
    collectPickup(sprite, player) {
        // Find the pickup object
        const pickup = this.pickups.find(p => p.sprite === sprite);
        if (!pickup || pickup.state !== 'ACTIVE') {
            return; // Already collected or not found
        }

        console.log(`[OilPickupManager] ${player.name} collected pickup ${pickup.id}`);

        // In MP mode the server is authoritative for oil; predicting locally
        // causes a flicker when a snapshot taken before the server-side pickup
        // tick arrives and overwrites the prediction.
        if (!this.scene.isMultiplayer) {
            player.addOil(pickup.oilAmount);
        }

        // Change state to collected
        pickup.state = 'COLLECTED';
        pickup.respawnTimer = this.respawnDelay;

        // Hide sprite (don't destroy it)
        pickup.sprite.setVisible(false);
        pickup.sprite.body.enable = false;

        // Visual feedback: amber sparkle burst at the pickup location
        if (this.scene.playCollectBurst) {
            this.scene.playCollectBurst(pickup.initialX, pickup.initialY, 0xffaa33);
        }
    }

    /**
     * Update all pickups (handle respawn timers)
     * @param {number} delta - Time since last update in milliseconds
     */
    update(delta) {
        this.pickups.forEach(pickup => {
            if (pickup.state === 'COLLECTED') {
                // Count down respawn timer
                pickup.respawnTimer -= delta;

                if (pickup.respawnTimer <= 0) {
                    this.respawnPickup(pickup);
                }
            } else if (pickup.state === 'ACTIVE') {
                // Update pulse animation for active pickups
                this.updatePulseAnimation(pickup, delta);
            }
        });
    }

    /**
     * Respawn a collected pickup
     */
    respawnPickup(pickup) {
        console.log(`[OilPickupManager] Respawning pickup ${pickup.id}`);

        pickup.state = 'ACTIVE';
        pickup.respawnTimer = 0;

        // Show sprite and enable physics
        pickup.sprite.setVisible(true);
        pickup.sprite.body.enable = true;

        // Reset position (in case it moved)
        pickup.sprite.setPosition(pickup.initialX, pickup.initialY);

        // Reset scale and alpha for pulse animation
        pickup.sprite.setScale(1);
        pickup.sprite.setAlpha(1);
    }

    /**
     * Update pulse animation for active pickups
     */
    updatePulseAnimation(pickup, delta) {
        // Simple sine-wave pulse effect
        const pulseSpeed = 0.003; // Speed of pulse
        const pulseAmount = 0.15; // Amount of size change (15%)

        if (!pickup.pulseTime) {
            pickup.pulseTime = 0;
        }

        pickup.pulseTime += delta * pulseSpeed;
        const pulse = Math.sin(pickup.pulseTime) * pulseAmount;
        const scale = 1 + pulse;

        pickup.sprite.setScale(scale);
    }

    /**
     * Get pickup count by state
     */
    getStats() {
        const active = this.pickups.filter(p => p.state === 'ACTIVE').length;
        const collected = this.pickups.filter(p => p.state === 'COLLECTED').length;

        return {
            total: this.pickups.length,
            active: active,
            collected: collected
        };
    }

    /**
     * Debug: Get all pickup states
     */
    getPickupStates() {
        return this.pickups.map(p => ({
            id: p.id,
            state: p.state,
            respawnTimer: p.respawnTimer > 0 ? (p.respawnTimer / 1000).toFixed(1) + 's' : '0s'
        }));
    }

    /**
     * Spawn pickups at server-provided positions (multiplayer mode).
     * @param {Array} positions - [{id, x, y}, ...]
     */
    spawnAtPositions(positions) {
        console.log(`[OilPickupManager] Spawning ${positions.length} server-provided pickups`);

        for (const pos of positions) {
            const sprite = this._createSprite(pos.x, pos.y, pos.id);

            this.pickups.push({
                id: pos.id,
                sprite,
                initialX: pos.x,
                initialY: pos.y,
                state: 'ACTIVE',
                respawnTimer: 0,
                oilAmount: this.oilAmount
            });
        }

        this.createCollisionGroup();
        console.log(`[OilPickupManager] Total server pickups: ${this.pickups.length}`);
    }

    /**
     * Apply server state for a specific pickup (multiplayer mode).
     * Called when a dirty pickup update arrives in world_snapshot.
     * @param {number} id
     * @param {string} state - 'ACTIVE' | 'COLLECTED'
     */
    applyServerState(id, state) {
        const pickup = this.pickups.find(p => p.id === id);
        if (!pickup) return;

        if (state === 'COLLECTED' && pickup.state === 'ACTIVE') {
            pickup.state = 'COLLECTED';
            pickup.sprite.setVisible(false);
            pickup.sprite.body.enable = false;
            if (this.scene.playCollectBurst) {
                this.scene.playCollectBurst(pickup.initialX, pickup.initialY, 0xffaa33);
            }
        } else if (state === 'ACTIVE' && pickup.state === 'COLLECTED') {
            pickup.state = 'ACTIVE';
            pickup.sprite.setVisible(true);
            pickup.sprite.body.enable = true;
            pickup.sprite.setPosition(pickup.initialX, pickup.initialY);
            pickup.sprite.setScale(1);
            pickup.sprite.setAlpha(1);
        }
    }
}
