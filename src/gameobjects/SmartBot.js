import { BotPlayer } from './BotPlayer.js';

/**
 * SmartBot - Strategic AI with priority-based decision making
 * Represents 30% of bots - poses a real challenge to human player
 *
 * Priority System:
 * 1. FLEE if enemy within danger radius (150px)
 * 2. SEEK oil if currentOil < 30%
 * 3. SEEK visible oil within vision radius (200px)
 * 4. EXPLORE (random wander with goal-oriented movement)
 */
export class SmartBot extends BotPlayer {
    constructor(scene, x, y, playerId) {
        super(scene, x, y, playerId, `SmartBot${playerId}`);

        // Smart bot specific properties
        this.oilThreshold = 30; // Seek oil when below 30% oil
        this.aiState = 'EXPLORE'; // Current AI state: 'FLEE' | 'SEEK_OIL' | 'EXPLORE'

        // Throttle AI decision updates
        this.aiUpdateTimer = 0;
        this.aiUpdateInterval = 300; // Update decisions every 300ms

        console.log(`[SmartBot] ${this.name} created (strategic AI)`);
    }

    /**
     * Update with strategic priority-based AI
     */
    update(delta) {
        // Call shared update logic
        if (!this.updateBot(delta)) {
            return; // Bot is dead
        }

        // Throttle AI decision making (not every frame)
        this.aiUpdateTimer += delta;

        if (this.aiUpdateTimer >= this.aiUpdateInterval) {
            this.aiUpdateTimer = 0;
            this.makeDecision();
        }

        // Execute current AI state
        this.executeAI();
    }

    /**
     * Make AI decision based on priority system
     */
    makeDecision() {
        // Priority 1: FLEE from nearby enemies
        const nearbyEnemy = this.isEnemyNearby();
        if (nearbyEnemy) {
            this.aiState = 'FLEE';
            this.targetX = nearbyEnemy.x;
            this.targetY = nearbyEnemy.y;
            return;
        }

        // Priority 2: SEEK oil if critically low (below 30%)
        if (this.getOilPercentage() < this.oilThreshold) {
            const nearestOil = this.findNearestOil();
            if (nearestOil) {
                this.aiState = 'SEEK_OIL';
                this.targetX = nearestOil.x;
                this.targetY = nearestOil.y;
                return;
            }
        }

        // Priority 3: SEEK visible oil within vision radius (opportunistic)
        const nearestOil = this.findNearestOil();
        if (nearestOil) {
            const dist = Phaser.Math.Distance.Between(
                this.x, this.y,
                nearestOil.x, nearestOil.y
            );

            if (dist < this.visionRadius) {
                this.aiState = 'SEEK_OIL';
                this.targetX = nearestOil.x;
                this.targetY = nearestOil.y;
                return;
            }
        }

        // Priority 4: EXPLORE (random wander)
        this.aiState = 'EXPLORE';

        // Generate new exploration target if we reached the current one
        if (this.targetX === null || this.hasReachedTarget(30)) {
            this.generateRandomTarget();
        }
    }

    /**
     * Execute AI behavior based on current state
     */
    executeAI() {
        switch (this.aiState) {
            case 'FLEE':
                // Move away from enemy
                if (this.targetX !== null && this.targetY !== null) {
                    this.moveAway(this.targetX, this.targetY);
                }
                break;

            case 'SEEK_OIL':
                // Move toward oil pickup
                if (this.targetX !== null && this.targetY !== null) {
                    this.moveToward(this.targetX, this.targetY);
                }
                break;

            case 'EXPLORE':
                // Random wander with purpose
                if (this.targetX !== null && this.targetY !== null) {
                    this.moveToward(this.targetX, this.targetY);
                } else {
                    this.generateRandomTarget();
                }
                break;

            default:
                // Fallback to random wander
                this.randomWander();
                break;
        }
    }
}
