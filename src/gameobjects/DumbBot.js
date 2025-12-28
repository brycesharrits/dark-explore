import { BotPlayer } from './BotPlayer.js';

/**
 * DumbBot - Simple AI with random wandering and occasional oil seeking
 * Represents 70% of bots - easy targets for smart bots and human player
 */
export class DumbBot extends BotPlayer {
    constructor(scene, x, y, playerId) {
        super(scene, x, y, playerId, `Bot${playerId}`);

        // Dumb bot specific properties
        this.oilSeekDistance = 100; // Only seeks oil within 100px
        this.oilSeekChance = 0.5; // 50% chance to go for nearby oil

        // Direction change timer (similar to current CaveEnemy)
        this.directionChangeTimer = 0;
        this.directionChangeDelay = Phaser.Math.Between(2000, 4000); // 2-4 seconds

        console.log(`[DumbBot] ${this.name} created (simple AI)`);
    }

    /**
     * Update with simple AI logic
     */
    update(delta) {
        // Call shared update logic
        if (!this.updateBot(delta)) {
            return; // Bot is dead
        }

        // Update direction change timer
        this.directionChangeTimer += delta;

        // Simple AI decision tree:
        // 1. Occasionally seek nearby oil (50% chance if oil within 100px)
        // 2. Otherwise, random wander

        // Check for nearby oil occasionally (not every frame)
        if (this.directionChangeTimer >= this.directionChangeDelay) {
            this.directionChangeTimer = 0;
            this.directionChangeDelay = Phaser.Math.Between(2000, 4000);

            // Look for nearby oil
            const nearestOil = this.findNearestOil();

            if (nearestOil) {
                const dist = Phaser.Math.Distance.Between(
                    this.x, this.y,
                    nearestOil.x, nearestOil.y
                );

                // Only go for oil if it's close and we randomly decide to
                if (dist < this.oilSeekDistance && Math.random() < this.oilSeekChance) {
                    this.targetX = nearestOil.x;
                    this.targetY = nearestOil.y;
                    return;
                }
            }

            // Otherwise, pick a new random target
            this.generateRandomTarget();
        }

        // Move toward current target (oil or random wander point)
        if (this.targetX !== null) {
            this.moveToward(this.targetX, this.targetY);
        }
    }
}
