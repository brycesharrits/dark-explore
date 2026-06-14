import { BasePlayer } from './BasePlayer.js';

/**
 * HumanPlayer - Human-controlled player with keyboard input
 * Extends BasePlayer to add keyboard movement logic
 */
export class HumanPlayer extends BasePlayer {
    constructor(scene, x, y) {
        super(scene, x, y, 0, 'You'); // Human player always has ID 0

        this.isHuman = true;

        // Movement state
        this.isMoving = false;

        console.log('[HumanPlayer] Human player created');
    }

    /**
     * Update with keyboard input (cursors and WASD)
     */
    update(cursors, wasd, delta) {
        // Call shared update logic (oil depletion, score, etc.)
        this.updateCommon(delta);

        // Only process movement if alive
        if (this.state !== 'ALIVE') {
            this.setVelocity(0);
            return;
        }

        // Reset velocity
        this.setVelocity(0);

        // Check for input and move accordingly
        let moving = false;

        if (cursors.left.isDown || wasd.left.isDown) {
            this.setVelocityX(-this.speed);
            moving = true;
        } else if (cursors.right.isDown || wasd.right.isDown) {
            this.setVelocityX(this.speed);
            moving = true;
        }

        if (cursors.up.isDown || wasd.up.isDown) {
            this.setVelocityY(-this.speed);
            moving = true;
        } else if (cursors.down.isDown || wasd.down.isDown) {
            this.setVelocityY(this.speed);
            moving = true;
        }

        // Normalize diagonal movement so it's not faster
        if (this.body.velocity.x !== 0 && this.body.velocity.y !== 0) {
            this.setVelocity(
                this.body.velocity.x * 0.707, // 1/sqrt(2) to normalize
                this.body.velocity.y * 0.707
            );
        }

        this.isMoving = moving;
    }

    /**
     * Apply authoritative position/state from the server snapshot.
     * Soft-corrects small drift, hard-snaps large divergence.
     */
    applyServerState(serverX, serverY, oil, speed, score) {
        const dx = Math.abs(this.x - serverX);
        const dy = Math.abs(this.y - serverY);

        if (dx > 64 || dy > 64) {
            // Hard correction — too far off
            this.setPosition(serverX, serverY);
        } else if (dx > 8 || dy > 8) {
            // Soft lerp correction
            this.x = Phaser.Math.Linear(this.x, serverX, 0.3);
            this.y = Phaser.Math.Linear(this.y, serverY, 0.3);
        }
        // Small differences (< 8px) are ignored to avoid jitter

        this.currentOil = oil;
        if (speed !== undefined) this.speed = speed;
        if (score !== undefined) this.score = score;
    }

    /**
     * Get the player's current grid position
     */
    getGridPosition(tileSize) {
        return {
            x: Math.floor(this.x / tileSize),
            y: Math.floor(this.y / tileSize)
        };
    }
}
