import { Physics } from 'phaser';

export class CavePlayer extends Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        console.log('[CavePlayer] constructor called at position:', x, y);

        // Create a simple circle texture for the player
        const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xffff00, 1); // Yellow color
        graphics.fillCircle(16, 16, 12); // Circle with radius 12 at center of 32x32 texture
        graphics.generateTexture('player-avatar', 32, 32);
        graphics.destroy();

        super(scene, x, y, 'player-avatar');

        // Add to scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Enable lighting on player sprite
        this.setPipeline('Light2D');

        // Set player properties
        this.speed = 150; // Movement speed in pixels per second
        this.setCollideWorldBounds(true);

        // Grid-based movement properties
        this.isMoving = false;

        console.log('[CavePlayer] constructor complete - speed:', this.speed, '- lighting enabled');
    }

    update(cursors, wasd) {
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

    // Method to get the player's current grid position
    getGridPosition(tileSize) {
        return {
            x: Math.floor(this.x / tileSize),
            y: Math.floor(this.y / tileSize)
        };
    }
}
