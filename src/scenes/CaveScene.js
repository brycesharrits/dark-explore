import { Scene } from 'phaser';
import { CavePlayer } from '../gameobjects/CavePlayer';

export class CaveScene extends Scene {
    // Static variable to store high score across game sessions (for the current browser session)
    static sessionHighScore = 0;

    constructor() {
        super({ key: 'CaveScene' });
        this.tileSize = 32; // Size of each tile in pixels
        this.gridWidth = 30; // Number of tiles wide
        this.gridHeight = 30; // Number of tiles tall

        // Game state
        this.gameStarted = false; // Track if game has started
        this.gameOver = false; // Track if game is over
        this.score = 0; // Current score
        this.scoreTimer = 0; // Timer for score increments

        // Lantern system properties
        this.maxOil = 100; // Maximum oil capacity
        this.currentOil = 100; // Current oil level (starts full)
        this.oilDepletionRate = 10; // Oil units consumed per second - 2 is default
        this.maxLightRadius = 240; // Maximum light radius in pixels
        this.minLightRadius = 20; // Minimum light radius before game over (legacy - used for calculations)
        this.minRadiusBeforeDim = 80; // Minimum radius before dimming starts (circle stops shrinking here)
        this.maxLightIntensity = 1.5; // Maximum light intensity

        // Oil pickup properties
        this.numOilPickups = 5; // Number of oil pickups to spawn
        this.oilPickupAmount = 25; // Amount of oil restored per pickup
    }

    create() {
        console.log('[CaveScene] create() called');

        // Reset game state (important for scene restart)
        this.gameStarted = false;
        this.gameOver = false;
        this.currentOil = this.maxOil;
        this.score = 0;
        this.scoreTimer = 0;

        // Set world bounds based on grid size
        const worldWidth = this.gridWidth * this.tileSize;
        const worldHeight = this.gridHeight * this.tileSize;
        console.log('[CaveScene] World dimensions:', worldWidth, 'x', worldHeight);
        this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

        // Create the tile grid
        console.log('[CaveScene] Creating tile grid...');
        this.createTileGrid();

        // Create the player
        console.log('[CaveScene] Creating player at', worldWidth / 2, worldHeight / 2);
        this.player = new CavePlayer(
            this,
            worldWidth / 2,
            worldHeight / 2
        );

        // Create the lantern/visibility system
        console.log('[CaveScene] Creating lantern system...');
        this.createLanternSystem(worldWidth, worldHeight);

        // Create oil pickups
        console.log('[CaveScene] Creating oil pickups...');
        this.createOilPickups(worldWidth, worldHeight);

        // Configure camera to follow player
        console.log('[CaveScene] Configuring camera...');
        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setZoom(1);

        // Set up keyboard controls
        console.log('[CaveScene] Setting up keyboard controls...');
        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({
            up: Phaser.Input.Keyboard.KeyCodes.W,
            down: Phaser.Input.Keyboard.KeyCodes.S,
            left: Phaser.Input.Keyboard.KeyCodes.A,
            right: Phaser.Input.Keyboard.KeyCodes.D
        });
        this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

        // Create start screen text
        console.log('[CaveScene] Creating start screen text...');
        this.startText = this.add.text(
            20,
            20,
            'Use arrow keys to begin',
            {
                fontSize: '24px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }
        );
        this.startText.setOrigin(0, 0);
        this.startText.setScrollFactor(0);
        this.startText.setDepth(100);

        // Add blinking animation like a cursor
        this.tweens.add({
            targets: this.startText,
            alpha: 0,
            duration: 600,
            ease: 'Linear',
            yoyo: true,
            repeat: -1
        });

        console.log('[CaveScene] create() complete');
    }

    createTileGrid() {
        console.log('[CaveScene] createTileGrid() - Drawing', this.gridWidth, 'x', this.gridHeight, 'tiles');

        // Create a render texture to draw the tiles, which can be lit
        const worldWidth = this.gridWidth * this.tileSize;
        const worldHeight = this.gridHeight * this.tileSize;
        const tileTexture = this.add.renderTexture(0, 0, worldWidth, worldHeight);

        // Set origin to top-left so position (0,0) means top-left corner at (0,0)
        tileTexture.setOrigin(0, 0);

        console.log('[CaveScene] Tile texture created:', worldWidth, 'x', worldHeight, 'at position (0, 0)');

        // Create a temporary graphics object to draw tiles
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Draw cave floor tiles
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const tileX = x * this.tileSize;
                const tileY = y * this.tileSize;

                // Alternate between two shades of gray for a checkerboard pattern
                const color = (x + y) % 2 === 0 ? 0x555555 : 0x444444;

                graphics.fillStyle(color, 1);
                graphics.fillRect(tileX, tileY, this.tileSize, this.tileSize);

                // Draw tile border
                graphics.lineStyle(1, 0x333333, 0.5);
                graphics.strokeRect(tileX, tileY, this.tileSize, this.tileSize);
            }
        }

        // Draw the graphics onto the render texture
        tileTexture.draw(graphics, 0, 0);
        graphics.destroy();

        // Enable lighting on the tile texture
        tileTexture.setPipeline('Light2D');

        console.log('[CaveScene] createTileGrid() complete - lighting enabled, origin set to (0, 0)');
    }

    createLanternSystem(worldWidth, worldHeight) {
        console.log('=== LANTERN SETUP START ===');
        console.log('[LANTERN] Using Phaser lighting system');

        // Store world dimensions
        this.worldWidth = worldWidth;
        this.worldHeight = worldHeight;

        // Enable lighting for this scene
        this.lights.enable();

        // Set very dark ambient light (the cave darkness)
        this.lights.setAmbientColor(0x0a0a0a); // Very dark gray, almost black

        // Create a point light at player position (the lantern)
        this.lanternLight = this.lights.addLight(0, 0, this.maxLightRadius, 0xffffff, 1.5);

        console.log('[LANTERN] Lighting system enabled');
        console.log('[LANTERN] Ambient color set to dark');
        console.log('[LANTERN] Lantern light created with radius:', this.maxLightRadius);
        console.log('=== LANTERN SETUP COMPLETE ===\n');
    }

    createOilPickups(worldWidth, worldHeight) {
        console.log('[OIL PICKUPS] Creating oil pickup group...');

        // Create a physics group for oil pickups
        this.oilPickups = this.physics.add.group();

        // Spawn oil pickups at random locations
        for (let i = 0; i < this.numOilPickups; i++) {
            // Generate random position within world bounds, with some padding
            const padding = this.tileSize * 2;
            const x = Phaser.Math.Between(padding, worldWidth - padding);
            const y = Phaser.Math.Between(padding, worldHeight - padding);

            // Create a graphics object for the oil pickup (small red circle)
            const graphics = this.make.graphics({ x: 0, y: 0, add: false });
            graphics.fillStyle(0xff6600, 1); // Orange color for oil
            graphics.fillCircle(8, 8, 6); // Small circle with radius 6

            // Generate a unique texture for this pickup
            const textureName = `oil-pickup-${i}`;
            graphics.generateTexture(textureName, 16, 16);
            graphics.destroy();

            // Create the oil pickup sprite
            const oilPickup = this.physics.add.sprite(x, y, textureName);
            oilPickup.setPipeline('Light2D'); // Enable lighting on the pickup

            // Add to the group
            this.oilPickups.add(oilPickup);

            console.log(`[OIL PICKUPS] Spawned pickup ${i + 1} at (${x}, ${y})`);
        }

        // Set up collision detection with player
        this.physics.add.overlap(
            this.player,
            this.oilPickups,
            this.collectOilPickup,
            null,
            this
        );

        console.log(`[OIL PICKUPS] Created ${this.numOilPickups} oil pickups with collision detection`);
    }

    collectOilPickup(player, oilPickup) {
        console.log('[OIL PICKUPS] Collecting oil pickup!');

        // Add oil to the player's lantern
        this.addOil(this.oilPickupAmount);

        // Remove the pickup from the scene
        oilPickup.destroy();

        console.log(`[OIL PICKUPS] Added ${this.oilPickupAmount} oil. Current oil: ${this.currentOil}/${this.maxOil}`);
    }

    updateLightMask() {
        if (!this.updateLightMaskCount) this.updateLightMaskCount = 0;
        this.updateLightMaskCount++;

        const currentOilPercent = this.currentOil / this.maxOil;

        // Calculate the oil percentage threshold where minimum radius is reached
        // This is where the circle stops shrinking and dimming begins
        const oilThresholdPercent = (this.minRadiusBeforeDim - this.minLightRadius) / (this.maxLightRadius - this.minLightRadius);

        let currentRadius;
        let currentIntensity;

        if (currentOilPercent > oilThresholdPercent) {
            // Phase 1: Above threshold - shrink radius normally, keep intensity at max
            currentRadius = this.minLightRadius + (this.maxLightRadius - this.minLightRadius) * currentOilPercent;
            currentIntensity = this.maxLightIntensity;
        } else {
            // Phase 2: Below threshold - keep radius at minimum, dim intensity
            currentRadius = this.minRadiusBeforeDim;
            // Calculate dim progress: 1.0 at threshold, 0.0 at empty
            const dimProgress = currentOilPercent / oilThresholdPercent;
            currentIntensity = this.maxLightIntensity * dimProgress;
        }

        // Update lantern light position, radius, and intensity
        this.lanternLight.setPosition(this.player.x, this.player.y);
        this.lanternLight.setRadius(currentRadius);
        this.lanternLight.setIntensity(currentIntensity);

        if (this.updateLightMaskCount <= 3) {
            console.log('=== UPDATE LIGHT #' + this.updateLightMaskCount + ' ===');
            console.log('[LIGHT] Oil:', this.currentOil.toFixed(1) + '/' + this.maxOil, '(' + (currentOilPercent * 100).toFixed(1) + '%)');
            console.log('[LIGHT] Threshold:', (oilThresholdPercent * 100).toFixed(1) + '%');
            console.log('[LIGHT] Radius:', currentRadius.toFixed(1), 'px');
            console.log('[LIGHT] Intensity:', currentIntensity.toFixed(2));
            console.log('[LIGHT] Light position:', this.player.x.toFixed(1), this.player.y.toFixed(1));
            console.log('=== END UPDATE #' + this.updateLightMaskCount + ' ===\n');
        }
    }

    update(time, delta) {
        if (!this.updateCount) {
            this.updateCount = 0;
            console.log('[CaveScene] First update() called');
        }
        this.updateCount++;

        if (this.updateCount === 1 || this.updateCount % 60 === 0) {
            //console.log('[CaveScene] update #' + this.updateCount + ' - time:', time.toFixed(0), 'delta:', delta.toFixed(1));
        }

        // Check for restart after game over
        if (this.gameOver) {
            if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) {
                console.log('[CaveScene] Restarting game...');
                this.scene.restart();
            }
            return;
        }

        if (this.player) {
            // Check if game should start (arrow key pressed while not started)
            if (!this.gameStarted) {
                const arrowKeyPressed =
                    this.cursors.up.isDown ||
                    this.cursors.down.isDown ||
                    this.cursors.left.isDown ||
                    this.cursors.right.isDown ||
                    this.wasd.up.isDown ||
                    this.wasd.down.isDown ||
                    this.wasd.left.isDown ||
                    this.wasd.right.isDown;

                if (arrowKeyPressed) {
                    this.startGame();
                }

                // Still update light position even when not started
                this.updateLightMask();
                return;
            }

            // Game has started - normal gameplay
            // Pass input to player
            this.player.update(this.cursors, this.wasd);

            // Deplete oil over time (delta is in milliseconds, convert to seconds)
            const deltaSeconds = delta / 1000;
            this.currentOil -= this.oilDepletionRate * deltaSeconds;

            // Update score timer (increment score every second)
            this.scoreTimer += deltaSeconds;
            if (this.scoreTimer >= 1) {
                this.score += 1;
                this.scoreTimer -= 1; // Keep remainder for accuracy
            }

            // Clamp oil to valid range
            this.currentOil = Math.max(0, this.currentOil);

            // Update the light mask to reflect new position and oil level
            this.updateLightMask();

            // Check for game over
            if (this.currentOil <= 0) {
                console.log('[CaveScene] Game Over - out of oil!');
                this.handleGameOver();
            }
        }
    }

    startGame() {
        console.log('[CaveScene] Starting game!');
        this.gameStarted = true;

        // Remove start text
        if (this.startText) {
            this.startText.destroy();
            this.startText = null;
        }

        // Launch the HUD scene
        console.log('[CaveScene] Launching HUD scene...');
        this.scene.launch('CaveHudScene');
    }

    handleGameOver() {
        console.log('[CaveScene] handleGameOver() called');
        this.gameOver = true;

        // Update high score if current score is higher
        if (this.score > CaveScene.sessionHighScore) {
            CaveScene.sessionHighScore = this.score;
        }

        // Stop the HUD scene
        this.scene.stop('CaveHudScene');

        // Create full-screen black overlay
        this.blackOverlay = this.add.rectangle(
            0,
            0,
            this.cameras.main.width,
            this.cameras.main.height,
            0x000000
        );
        this.blackOverlay.setOrigin(0, 0);
        this.blackOverlay.setScrollFactor(0);
        this.blackOverlay.setDepth(150);

        // Create game over text in same position as start text
        this.gameOverText = this.add.text(
            20,
            20,
            'Game Over. Press space to play again',
            {
                fontSize: '24px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 4
            }
        );
        this.gameOverText.setOrigin(0, 0);
        this.gameOverText.setScrollFactor(0);
        this.gameOverText.setDepth(200);

        // Add score display below the game over text
        this.scoreDisplayText = this.add.text(
            20,
            60,
            `Score: ${this.score}\nHigh Score: ${CaveScene.sessionHighScore}`,
            {
                fontSize: '20px',
                color: '#ffaa00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.scoreDisplayText.setOrigin(0, 0);
        this.scoreDisplayText.setScrollFactor(0);
        this.scoreDisplayText.setDepth(200);

        // Add blinking animation like the start text
        this.tweens.add({
            targets: this.gameOverText,
            alpha: 0,
            duration: 600,
            ease: 'Linear',
            yoyo: true,
            repeat: -1
        });
    }

    // Method to add oil (for pickups later)
    addOil(amount) {
        this.currentOil = Math.min(this.maxOil, this.currentOil + amount);
    }

    // Get current oil percentage
    getOilPercentage() {
        return (this.currentOil / this.maxOil) * 100;
    }

    // Get current score
    getScore() {
        return this.score;
    }
}
