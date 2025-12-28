import { BasePlayer } from './BasePlayer.js';

/**
 * BotPlayer - Base class for all bot players with shared AI utilities
 * Provides vision, steering behaviors, and utility methods for AI decision-making
 */
export class BotPlayer extends BasePlayer {
    constructor(scene, x, y, playerId, name) {
        super(scene, x, y, playerId, name);

        this.isHuman = false;

        // AI properties
        this.visionRadius = 200; // Can see entities within 200px
        this.dangerRadius = 150; // Flee if enemy within 150px

        // Current movement target
        this.targetX = null;
        this.targetY = null;

        // AI update throttling
        this.aiUpdateTimer = 0;
        this.aiUpdateInterval = 200; // Update AI decisions every 200ms

        // Current velocity direction
        this.moveDirection = { x: 0, y: 0 };

        console.log(`[BotPlayer] Bot ${this.name} created`);
    }

    /**
     * Update method - must be implemented by subclasses
     */
    update(delta) {
        throw new Error('BotPlayer.update() must be implemented by subclass');
    }

    /**
     * Shared bot update logic
     * Subclasses should call this and then implement their specific AI
     */
    updateBot(delta) {
        // Call common update (oil depletion, score, etc.)
        this.updateCommon(delta);

        // Only process AI if alive
        if (this.state !== 'ALIVE') {
            this.setVelocity(0);
            return false;
        }

        return true; // Bot is alive, continue with AI
    }

    /**
     * Move toward a target position
     */
    moveToward(targetX, targetY) {
        if (targetX === null || targetY === null) {
            return;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        const vx = Math.cos(angle) * this.speed;
        const vy = Math.sin(angle) * this.speed;

        this.setVelocity(vx, vy);
    }

    /**
     * Move away from a target position (flee)
     */
    moveAway(targetX, targetY) {
        if (targetX === null || targetY === null) {
            return;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);
        const vx = -Math.cos(angle) * this.speed; // Negative to move away
        const vy = -Math.sin(angle) * this.speed;

        this.setVelocity(vx, vy);
    }

    /**
     * Find the nearest oil pickup within vision radius
     */
    findNearestOil() {
        const oilPickups = this.scene.oilPickups;
        if (!oilPickups) return null;

        let nearest = null;
        let minDistance = this.visionRadius;

        oilPickups.getChildren().forEach(pickup => {
            if (!pickup.active || !pickup.visible) return;

            const dist = Phaser.Math.Distance.Between(
                this.x, this.y,
                pickup.x, pickup.y
            );

            if (dist < minDistance) {
                minDistance = dist;
                nearest = pickup;
            }
        });

        return nearest;
    }

    /**
     * Find the nearest enemy within vision radius
     */
    findNearestEnemy() {
        const enemies = this.scene.enemies;
        if (!enemies) return null;

        let nearest = null;
        let minDistance = this.visionRadius;

        enemies.getChildren().forEach(enemy => {
            if (!enemy.active) return;

            const dist = Phaser.Math.Distance.Between(
                this.x, this.y,
                enemy.x, enemy.y
            );

            if (dist < minDistance) {
                minDistance = dist;
                nearest = enemy;
            }
        });

        return nearest;
    }

    /**
     * Check if an enemy is within danger radius
     */
    isEnemyNearby() {
        const enemies = this.scene.enemies;
        if (!enemies) return false;

        const enemiesArray = enemies.getChildren();
        for (let enemy of enemiesArray) {
            if (!enemy.active) continue;

            const dist = Phaser.Math.Distance.Between(
                this.x, this.y,
                enemy.x, enemy.y
            );

            if (dist < this.dangerRadius) {
                return enemy;
            }
        }

        return null;
    }

    /**
     * Generate a random exploration target within world bounds
     */
    generateRandomTarget() {
        const worldWidth = this.scene.gridWidth * this.scene.tileSize;
        const worldHeight = this.scene.gridHeight * this.scene.tileSize;
        const padding = this.scene.tileSize * 2;

        this.targetX = Phaser.Math.Between(padding, worldWidth - padding);
        this.targetY = Phaser.Math.Between(padding, worldHeight - padding);
    }

    /**
     * Check if bot has reached its target (within threshold)
     */
    hasReachedTarget(threshold = 50) {
        if (this.targetX === null || this.targetY === null) {
            return true;
        }

        const dist = Phaser.Math.Distance.Between(
            this.x, this.y,
            this.targetX, this.targetY
        );

        return dist < threshold;
    }

    /**
     * Random wander behavior (used as fallback by most bots)
     */
    randomWander() {
        // Generate new target if we don't have one or reached current one
        if (this.targetX === null || this.hasReachedTarget()) {
            this.generateRandomTarget();
        }

        // Move toward target
        this.moveToward(this.targetX, this.targetY);
    }
}
