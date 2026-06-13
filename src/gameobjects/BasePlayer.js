import { Physics } from 'phaser';

/**
 * BasePlayer - Abstract base class for all player types (human and bots)
 * Handles shared logic: oil depletion, state management, sprite setup
 */
export class BasePlayer extends Physics.Arcade.Sprite {
    constructor(scene, x, y, playerId, name) {
        // Create a unique texture for this player
        const textureName = `player-${playerId}`;
        BasePlayer.createPlayerTexture(scene, textureName, playerId);

        super(scene, x, y, textureName);

        // Player identification
        this.playerId = playerId;
        this.name = name || `Player${playerId}`;
        this.isHuman = false; // Override in HumanPlayer

        // Add to scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Enable lighting on player sprite
        this.setPipeline('Light2D');

        // Player state
        this.state = 'ALIVE'; // 'ALIVE' | 'DEAD'

        // Movement properties
        this.speed = 150; // Movement speed in pixels per second
        this.setCollideWorldBounds(true);

        // Oil/fuel system
        this.maxOil = 100;
        this.currentOil = 100;
        this.oilDepletionRate = 5; // Oil units consumed per second (tuned for longer games)

        // Score tracking
        this.score = 0;
        this.scoreTimer = 0; // Accumulator for score increments
        this.survivalTime = 0; // Total survival time in seconds

        // Elimination data
        this.eliminationReason = null; // 'OIL_DEPLETED' | 'ENEMY_COLLISION'
        this.eliminationTime = null;
        this.finalRank = null;

        console.log(`[BasePlayer] Created ${this.name} at (${x}, ${y})`);
    }

    /**
     * Static method to create player texture
     * Colors vary slightly based on playerId for visual distinction
     */
    static createPlayerTexture(scene, textureName, playerId) {
        // Skip if texture already exists
        if (scene.textures.exists(textureName)) {
            return;
        }

        const graphics = scene.make.graphics({ x: 0, y: 0, add: false });

        // Vary color slightly based on playerId
        // Human player (id=0) is yellow, bots are slight variations
        let color;
        if (playerId === 0) {
            color = 0xffff00; // Yellow for human
        } else {
            // Slight color variations for bots (yellow-orange range)
            const hue = 40 + (playerId % 20) * 2; // 40-80 range (yellow to orange)
            color = Phaser.Display.Color.HSLToColor(hue / 360, 0.8, 0.5).color;
        }

        graphics.fillStyle(color, 1);
        graphics.fillCircle(16, 16, 12); // Circle with radius 12 at center of 32x32 texture
        graphics.generateTexture(textureName, 32, 32);
        graphics.destroy();
    }

    /**
     * Update method - must be implemented by subclasses
     */
    update(delta) {
        throw new Error('BasePlayer.update() must be implemented by subclass');
    }

    /**
     * Shared update logic for all players
     * Handles oil depletion, score increment, survival time
     */
    updateCommon(delta) {
        if (this.state !== 'ALIVE') return;

        const deltaSeconds = delta / 1000;

        // Deplete oil over time
        this.currentOil -= this.oilDepletionRate * deltaSeconds;
        this.currentOil = Math.max(0, this.currentOil);

        // Increment score (1 point per second)
        this.scoreTimer += deltaSeconds;
        if (this.scoreTimer >= 1) {
            this.score += 1;
            this.scoreTimer -= 1;
        }

        // Track survival time
        this.survivalTime += deltaSeconds;

        // Check for oil depletion elimination
        if (this.currentOil <= 0) {
            this.eliminate('OIL_DEPLETED');
        }
    }

    /**
     * Add oil to the player's tank
     */
    addOil(amount) {
        if (this.state !== 'ALIVE') return;

        this.currentOil = Math.min(this.maxOil, this.currentOil + amount);
        console.log(`[${this.name}] Collected oil. Current: ${this.currentOil.toFixed(1)}/${this.maxOil}`);
    }

    /**
     * Get current oil percentage
     */
    getOilPercentage() {
        return (this.currentOil / this.maxOil) * 100;
    }

    /**
     * Eliminate this player from the game
     */
    eliminate(reason) {
        if (this.state === 'DEAD') return; // Already eliminated

        console.log(`[${this.name}] Eliminated: ${reason}`);

        this.state = 'DEAD';
        this.eliminationReason = reason;
        this.eliminationTime = Date.now();

        // Hide sprite and disable physics
        this.setVisible(false);
        this.body.enable = false;

        // Emit elimination event for the scene to handle
        this.scene.events.emit('player-eliminated', this, reason);
    }

    /**
     * Check if player is alive
     */
    isAlive() {
        return this.state === 'ALIVE';
    }

    /**
     * Get player state data for UI/debugging
     */
    getState() {
        return {
            playerId: this.playerId,
            name: this.name,
            state: this.state,
            position: { x: this.x, y: this.y },
            oil: this.currentOil,
            oilPercent: this.getOilPercentage(),
            score: this.score,
            survivalTime: this.survivalTime,
            eliminationReason: this.eliminationReason,
            finalRank: this.finalRank
        };
    }
}
