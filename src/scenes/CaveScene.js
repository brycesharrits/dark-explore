import { Scene } from 'phaser';
import { CavePlayer } from '../gameobjects/CavePlayer';

export class CaveScene extends Scene {
    constructor() {
        super({ key: 'CaveScene' });
        this.tileSize = 32; // Size of each tile in pixels
        this.gridWidth = 30; // Number of tiles wide
        this.gridHeight = 30; // Number of tiles tall

        // Lantern system properties
        this.maxOil = 100; // Maximum oil capacity
        this.currentOil = 100; // Current oil level (starts full)
        this.oilDepletionRate = 2; // Oil units consumed per second
        this.maxLightRadius = 120; // Maximum light radius in pixels
        this.minLightRadius = 20; // Minimum light radius before game over
    }

    create() {
        console.log('[CaveScene] create() called');

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

        // Launch the HUD scene
        console.log('[CaveScene] Launching HUD scene...');
        this.scene.launch('CaveHudScene');

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

    updateLightMask() {
        if (!this.updateLightMaskCount) this.updateLightMaskCount = 0;
        this.updateLightMaskCount++;

        // Calculate current light radius based on oil level
        const oilPercent = this.currentOil / this.maxOil;
        const currentRadius = this.minLightRadius + (this.maxLightRadius - this.minLightRadius) * oilPercent;

        // Update lantern light position and radius
        this.lanternLight.setPosition(this.player.x, this.player.y);
        this.lanternLight.setRadius(currentRadius);

        if (this.updateLightMaskCount <= 3) {
            console.log('=== UPDATE LIGHT #' + this.updateLightMaskCount + ' ===');
            console.log('[LIGHT] Oil:', this.currentOil.toFixed(1) + '/' + this.maxOil, '(' + (oilPercent * 100).toFixed(1) + '%)');
            console.log('[LIGHT] Radius:', currentRadius.toFixed(1), 'px');
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

        if (this.player) {
            // Pass input to player
            this.player.update(this.cursors, this.wasd);

            // Deplete oil over time (delta is in milliseconds, convert to seconds)
            const deltaSeconds = delta / 1000;
            this.currentOil -= this.oilDepletionRate * deltaSeconds;

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

    handleGameOver() {
        console.log('[CaveScene] handleGameOver() called');

        // Stop the scene
        this.scene.pause();

        // Display game over message
        const centerX = this.cameras.main.worldView.centerX;
        const centerY = this.cameras.main.worldView.centerY;

        const gameOverText = this.add.text(
            centerX,
            centerY,
            'GAME OVER\nOut of Oil!',
            {
                fontSize: '48px',
                color: '#ff0000',
                align: 'center'
            }
        );
        gameOverText.setOrigin(0.5);
        gameOverText.setScrollFactor(0);
        gameOverText.setDepth(200);
    }

    // Method to add oil (for pickups later)
    addOil(amount) {
        this.currentOil = Math.min(this.maxOil, this.currentOil + amount);
    }

    // Get current oil percentage
    getOilPercentage() {
        return (this.currentOil / this.maxOil) * 100;
    }
}
