import { Physics } from 'phaser';

export class CaveEnemy extends Physics.Arcade.Sprite {
    constructor(scene, x, y) {
        console.log('[CaveEnemy] constructor called at position:', x, y);

        // Create a simple circle texture for the enemy
        const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
        graphics.fillStyle(0xff0000, 1); // Red color
        graphics.fillCircle(16, 16, 10); // Circle with radius 10 at center of 32x32 texture

        // Add a darker inner circle for detail
        graphics.fillStyle(0xaa0000, 1);
        graphics.fillCircle(16, 16, 6);

        graphics.generateTexture('cave-enemy', 32, 32);
        graphics.destroy();

        super(scene, x, y, 'cave-enemy');

        // Add to scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Enable lighting on enemy sprite
        this.setPipeline('Light2D');

        // Set enemy properties
        this.speed = 80; // Movement speed (slower than player)
        this.setCollideWorldBounds(true);

        // AI properties
        this.changeDirectionTimer = 0;
        this.changeDirectionDelay = 2000; // Change direction every 2 seconds
        this.currentDirection = Phaser.Math.Between(0, 7); // 8 directions (including diagonals)

        console.log('[CaveEnemy] constructor complete - speed:', this.speed, '- lighting enabled');
    }

    update(time, delta) {
        // Simple wandering AI
        this.changeDirectionTimer += delta;

        // Reroll direction immediately when wedged against a wall
        const b = this.body;
        if (b && (b.blocked.up || b.blocked.down || b.blocked.left || b.blocked.right)) {
            this.currentDirection = Phaser.Math.Between(0, 7);
            this.changeDirectionTimer = 0;
        } else if (this.changeDirectionTimer >= this.changeDirectionDelay) {
            this.changeDirectionTimer = 0;
            this.currentDirection = Phaser.Math.Between(0, 7);
        }

        // Move based on current direction
        this.setVelocity(0);

        switch(this.currentDirection) {
            case 0: // Up
                this.setVelocityY(-this.speed);
                break;
            case 1: // Up-Right
                this.setVelocity(this.speed * 0.707, -this.speed * 0.707);
                break;
            case 2: // Right
                this.setVelocityX(this.speed);
                break;
            case 3: // Down-Right
                this.setVelocity(this.speed * 0.707, this.speed * 0.707);
                break;
            case 4: // Down
                this.setVelocityY(this.speed);
                break;
            case 5: // Down-Left
                this.setVelocity(-this.speed * 0.707, this.speed * 0.707);
                break;
            case 6: // Left
                this.setVelocityX(-this.speed);
                break;
            case 7: // Up-Left
                this.setVelocity(-this.speed * 0.707, -this.speed * 0.707);
                break;
        }
    }

    // Method to get the enemy's current grid position
    getGridPosition(tileSize) {
        return {
            x: Math.floor(this.x / tileSize),
            y: Math.floor(this.y / tileSize)
        };
    }
}
