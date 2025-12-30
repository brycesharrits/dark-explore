import { Scene } from 'phaser';
import { CaveEnemy } from '../gameobjects/CaveEnemy';
import { PlayerManager } from '../managers/PlayerManager';
import { DebugConfig } from '../config/DebugConfig';
import { SpatialPartition } from '../utils/SpatialPartition';
import { OilPickupManager } from '../managers/OilPickupManager';
import { EliminationTracker } from '../managers/EliminationTracker';
import { EliminationFeed } from '../ui/EliminationFeed';

export class CaveScene extends Scene {
    // Static variable to store high score across game sessions (for the current browser session)
    static sessionHighScore = 0;

    constructor() {
        super({ key: 'CaveScene' });
        this.tileSize = 32; // Size of each tile in pixels
        this.gridWidth = 200; // Number of tiles wide (Optimization #2 test: 200×200)
        this.gridHeight = 200; // Number of tiles tall (Optimization #2 test: 200×200)

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

        // Oil pickup properties (Phase 5: managed by OilPickupManager)
        this.numOilPickups = 72; // Number of oil pickups (scaled for 200×200 map: 4× larger)
        this.oilPickupManager = null; // Manager for oil pickups with respawn

        // Elimination tracking (Phase 6)
        this.eliminationTracker = null; // Tracks eliminations and rankings
        this.eliminationFeed = null; // Visual feed for eliminations
        this.victoryAchieved = false; // Track if victory condition has been met

        // Enemy properties
        this.enemySpawnDelay = 5000; // Spawn enemies after 5 seconds (in milliseconds)
        this.enemySpawnTimer = null; // Timer for spawning enemies
        this.enemies = null; // Group to hold enemies
        this.numEnemies = 60; // Number of enemies (scaled for 200×200 map: 4× larger)

        // Debug/testing mode
        this.debugGraphics = null; // Graphics object for debug visualizations
        this.originalAmbientColor = 0x0a0a0a; // Store original ambient color
        this.debugPlayerLabels = []; // Array of debug text labels for players
    }

    create() {
        console.log('[CaveScene] create() called');

        // Reset game state (important for scene restart)
        this.gameStarted = false;
        this.gameOver = false;
        this.victoryAchieved = false;
        this.currentOil = this.maxOil;
        this.score = 0;
        this.scoreTimer = 0;
        this.enemySpawnTimer = null;

        // Initialize enemies group
        this.enemies = this.add.group({
            classType: CaveEnemy,
            runChildUpdate: true // Automatically call update on all enemies
        });

        // Set world bounds based on grid size
        const worldWidth = this.gridWidth * this.tileSize;
        const worldHeight = this.gridHeight * this.tileSize;
        console.log('[CaveScene] World dimensions:', worldWidth, 'x', worldHeight);
        this.physics.world.setBounds(0, 0, worldWidth, worldHeight);

        // Initialize spatial partitioning for performance optimization
        console.log('[CaveScene] Initializing spatial partition...');
        this.spatialPartition = new SpatialPartition(
            { x: 0, y: 0, width: worldWidth, height: worldHeight },
            4 // Capacity: 4 entities per node before subdividing
        );

        // Create the tile grid
        console.log('[CaveScene] Creating tile grid...');
        this.createTileGrid();

        // Initialize PlayerManager and spawn human player
        console.log('[CaveScene] Initializing PlayerManager...');
        this.playerManager = new PlayerManager(this);
        this.playerManager.spawnHumanPlayer(worldWidth / 2, worldHeight / 2);

        // Convenience reference to human player (for compatibility)
        this.player = this.playerManager.humanPlayer;

        // Create the lantern/visibility system
        console.log('[CaveScene] Creating lantern system...');
        this.createLanternSystem(worldWidth, worldHeight);

        // Create oil pickups with respawn system (Phase 5)
        console.log('[CaveScene] Initializing OilPickupManager...');
        this.oilPickupManager = new OilPickupManager(this);
        this.oilPickupManager.spawnPickups(this.numOilPickups);

        // Initialize elimination tracker (Phase 6)
        console.log('[CaveScene] Initializing EliminationTracker...');
        this.eliminationTracker = new EliminationTracker(this);

        // Initialize elimination feed UI (Phase 6)
        console.log('[CaveScene] Initializing EliminationFeed...');
        this.eliminationFeed = new EliminationFeed(this);

        // Listen for player elimination events (Phase 6)
        this.events.on('player-eliminated', this.onPlayerEliminated, this);

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

        // Debug mode toggle key (T)
        this.debugKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T);
        this.debugKey.on('down', () => {
            this.toggleDebugMode();
        });

        // Create debug graphics object
        this.debugGraphics = this.add.graphics();
        this.debugGraphics.setDepth(1000); // Draw on top of everything
        this.debugGraphics.setScrollFactor(0); // Fixed to camera

        // Map to track player labels (for performance)
        this.debugPlayerLabelMap = new Map(); // playerId -> text object

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
        console.log('[CaveScene] createTileGrid() - Creating tilemap', this.gridWidth, 'x', this.gridHeight, 'tiles');
        console.log('[CaveScene] Optimization #2: Using Phaser Tilemap for automatic chunking');

        // Step 1: Create tileset texture (2 tile variants for checkerboard)
        this.createTilesetTexture();

        // Step 2: Create blank tilemap
        const map = this.make.tilemap({
            tileWidth: this.tileSize,
            tileHeight: this.tileSize,
            width: this.gridWidth,
            height: this.gridHeight
        });

        // Step 3: Add tileset to the map (references our generated texture)
        const tileset = map.addTilesetImage('cave-tileset', 'cave-tileset');

        // Step 4: Create layer from tileset
        const layer = map.createBlankLayer('ground', tileset, 0, 0);

        // Step 5: Fill layer with checkerboard pattern
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                // Alternate between tile 0 (light) and tile 1 (dark)
                const tileIndex = (x + y) % 2 === 0 ? 0 : 1;
                layer.putTileAt(tileIndex, x, y);
            }
        }

        // Step 6: Enable lighting on the tilemap layer
        layer.setPipeline('Light2D');

        // Store reference for potential future use
        this.tileMap = map;
        this.tileLayer = layer;

        console.log('[CaveScene] createTileGrid() complete - Tilemap with automatic chunking enabled');
    }

    /**
     * Create tileset texture for the tilemap (Optimization #2)
     * Generates a small texture with 2 tile variants for checkerboard pattern
     */
    createTilesetTexture() {
        // Create graphics object to draw tiles
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Tile 0: Light gray with border
        graphics.fillStyle(0x555555, 1);
        graphics.fillRect(0, 0, this.tileSize, this.tileSize);
        graphics.lineStyle(1, 0x333333, 0.5);
        graphics.strokeRect(0, 0, this.tileSize, this.tileSize);

        // Tile 1: Dark gray with border
        graphics.fillStyle(0x444444, 1);
        graphics.fillRect(this.tileSize, 0, this.tileSize, this.tileSize);
        graphics.lineStyle(1, 0x333333, 0.5);
        graphics.strokeRect(this.tileSize, 0, this.tileSize, this.tileSize);

        // Generate texture from graphics (2 tiles side by side)
        graphics.generateTexture('cave-tileset', this.tileSize * 2, this.tileSize);
        graphics.destroy();

        console.log('[CaveScene] Tileset texture created: 2 tiles @', this.tileSize, 'x', this.tileSize);
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

    /**
     * Handle oil pickup collection (Phase 5: uses OilPickupManager)
     */
    collectOilPickup(playerSprite, oilPickupSprite) {
        // Delegate to OilPickupManager
        this.oilPickupManager.collectPickup(oilPickupSprite, playerSprite);
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

            // Update spatial partition with all alive entities (for efficient queries)
            this.updateSpatialPartition();

            // Update all players through PlayerManager
            this.playerManager.updateAll(this.cursors, this.wasd, delta);

            // Update oil pickups (Phase 5: handle respawn timers and animations)
            this.oilPickupManager.update(delta);

            // For compatibility, sync scene-level variables with human player
            // (These will be removed in later phases)
            this.currentOil = this.player.currentOil;
            this.score = this.player.score;

            // Update the light mask to reflect new position and oil level
            this.updateLightMask();

            // Check if human player was eliminated (handled by BasePlayer now)
            if (!this.playerManager.isHumanAlive() && !this.gameOver) {
                console.log('[CaveScene] Game Over - human player eliminated!');
                this.handleGameOver();
            }
        }

        // Update debug visualizations (if debug mode is enabled)
        this.updateDebugVisuals();
    }

    startGame() {
        console.log('[CaveScene] Starting game!');
        this.gameStarted = true;

        // Remove start text
        if (this.startText) {
            this.startText.destroy();
            this.startText = null;
        }

        // Spawn bots (Phase 3: spawn 49 bots for 50 total players)
        console.log('[CaveScene] Spawning bots...');
        this.playerManager.spawnBots(49, 0.3); // 49 bots (30% smart, 70% dumb) + 1 human = 50 total

        // Initialize elimination tracker with total player count (Phase 6)
        const totalPlayers = this.playerManager.players.length;
        this.eliminationTracker.initialize(totalPlayers);
        console.log(`[CaveScene] Elimination tracker initialized for ${totalPlayers} players`);

        // Setup collision detection for all players (human + bots)
        this.setupMultiplayerCollisions();

        // Launch the HUD scene
        console.log('[CaveScene] Launching HUD scene...');
        this.scene.launch('CaveHudScene');

        // Set up timer to spawn enemies after 5 seconds
        console.log('[CaveScene] Setting up enemy spawn timer...');
        this.enemySpawnTimer = this.time.delayedCall(
            this.enemySpawnDelay,
            this.spawnEnemies,
            [],
            this
        );
    }

    /**
     * Handle player elimination event (Phase 6)
     * Called when any player is eliminated
     */
    onPlayerEliminated(player, reason) {
        console.log(`[CaveScene] onPlayerEliminated: ${player.name} - ${reason}`);

        // Record elimination in tracker
        const gameTime = this.time.now / 1000; // Convert to seconds
        const elimination = this.eliminationTracker.recordElimination(player, reason, gameTime);

        // Store final rank on the player object
        player.finalRank = elimination.rank;

        // Add to elimination feed (Phase 6)
        if (this.eliminationFeed) {
            this.eliminationFeed.addElimination(player.name, reason, elimination.rank);
        }

        // Check if human was eliminated
        if (player.isHuman && !this.gameOver) {
            console.log('[CaveScene] Human player eliminated!');
            this.handleGameOver();
            return;
        }

        // Check for victory condition (only 1 player left)
        if (this.eliminationTracker.hasWinner() && !this.victoryAchieved) {
            console.log('[CaveScene] Victory condition met!');
            this.handleVictory();
        }
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

        // Get human player's elimination data (Phase 6)
        const humanElimination = this.eliminationTracker.getHumanElimination();
        const rank = humanElimination ? humanElimination.rank : '?';
        const rankText = EliminationTracker.getOrdinalSuffix(rank);
        const reason = humanElimination ? EliminationTracker.formatReason(humanElimination.reason) : 'unknown';
        const playersLeft = this.eliminationTracker.getAlivePlayers();

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

        // Add score and rank display below the game over text (Phase 6)
        this.scoreDisplayText = this.add.text(
            20,
            60,
            `You placed ${rankText} out of ${this.eliminationTracker.totalPlayers}\n` +
            `${playersLeft} players remaining\n` +
            `Eliminated: ${reason}\n\n` +
            `Score: ${this.score}\n` +
            `High Score: ${CaveScene.sessionHighScore}`,
            {
                fontSize: '18px',
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

    /**
     * Handle victory condition (Phase 6)
     * Called when human player is the last one alive
     */
    handleVictory() {
        console.log('[CaveScene] handleVictory() called');
        this.victoryAchieved = true;
        this.gameOver = true; // Also set gameOver to prevent updates

        // Update high score if current score is higher
        if (this.score > CaveScene.sessionHighScore) {
            CaveScene.sessionHighScore = this.score;
        }

        // Stop the HUD scene
        this.scene.stop('CaveHudScene');

        // Create full-screen overlay with victory colors (gold tint)
        this.blackOverlay = this.add.rectangle(
            0,
            0,
            this.cameras.main.width,
            this.cameras.main.height,
            0x1a1a00 // Dark gold tint
        );
        this.blackOverlay.setOrigin(0, 0);
        this.blackOverlay.setScrollFactor(0);
        this.blackOverlay.setDepth(150);

        // Create victory text
        this.victoryText = this.add.text(
            20,
            20,
            'VICTORY ROYALE!',
            {
                fontSize: '32px',
                color: '#ffd700', // Gold color
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 6
            }
        );
        this.victoryText.setOrigin(0, 0);
        this.victoryText.setScrollFactor(0);
        this.victoryText.setDepth(200);

        // Add stats display below the victory text
        this.victoryStatsText = this.add.text(
            20,
            70,
            `You are the last survivor!\n` +
            `Winner out of ${this.eliminationTracker.totalPlayers} players\n\n` +
            `Final Score: ${this.score}\n` +
            `High Score: ${CaveScene.sessionHighScore}\n` +
            `Oil Remaining: ${this.player.currentOil.toFixed(0)}%\n\n` +
            `Press space to play again`,
            {
                fontSize: '18px',
                color: '#ffff00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.victoryStatsText.setOrigin(0, 0);
        this.victoryStatsText.setScrollFactor(0);
        this.victoryStatsText.setDepth(200);

        // Add pulsing animation to victory text
        this.tweens.add({
            targets: this.victoryText,
            scale: 1.1,
            duration: 800,
            ease: 'Sine.easeInOut',
            yoyo: true,
            repeat: -1
        });
    }

    // Spawn enemies at random locations
    spawnEnemies() {
        console.log('[CaveScene] Spawning enemies...');

        const worldWidth = this.gridWidth * this.tileSize;
        const worldHeight = this.gridHeight * this.tileSize;
        const padding = this.tileSize * 3; // Keep enemies away from edges

        // Spawn enemies (scaled for map size)
        const enemyCount = this.numEnemies || 15;
        for (let i = 0; i < enemyCount; i++) {
            // Generate random position within world bounds, with padding
            // Also ensure they spawn at least a certain distance from the player
            let x, y, distanceFromPlayer;
            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                distanceFromPlayer = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
            } while (distanceFromPlayer < 200); // Keep enemies at least 200 pixels away from player initially

            // Create enemy
            const enemy = new CaveEnemy(this, x, y);
            this.enemies.add(enemy);

            console.log(`[CaveScene] Spawned enemy ${i + 1} at (${x}, ${y}), distance from player: ${distanceFromPlayer.toFixed(0)}`);
        }

        console.log(`[CaveScene] Total enemies: ${this.enemies.getLength()}`);

        // Set up collision detection between all players and enemies
        this.enemyCollider = this.physics.add.overlap(
            this.allPlayerSprites || this.player, // Use all players if available, fallback to just human
            this.enemies,
            this.handleEnemyCollision,
            null,
            this
        );

        console.log('[CaveScene] Enemy collision detection enabled for all players');
    }

    /**
     * Setup collision detection for all players (human + bots) with enemies and oil pickups
     * Called after bots are spawned in startGame()
     */
    setupMultiplayerCollisions() {
        console.log('[CaveScene] Setting up multiplayer collisions...');

        // Get all player sprites (human + bots)
        const allPlayerSprites = this.playerManager.players.map(p => p);

        // Remove old colliders if they exist
        if (this.oilPickupCollider) {
            this.oilPickupCollider.destroy();
        }
        if (this.enemyCollider) {
            this.enemyCollider.destroy();
        }

        // Oil pickups vs all players (Phase 5: uses OilPickupManager)
        this.oilPickupCollider = this.physics.add.overlap(
            allPlayerSprites,
            this.oilPickupManager.getActiveSprites(),
            this.collectOilPickup,
            null,
            this
        );

        // Enemies vs all players (will be setup when enemies spawn)
        // Store reference for when spawnEnemies is called
        this.allPlayerSprites = allPlayerSprites;

        console.log(`[CaveScene] Collision detection enabled for ${allPlayerSprites.length} players`);
    }

    // Handle collision between player and enemy
    handleEnemyCollision(playerSprite, enemy) {
        console.log(`[CaveScene] ${playerSprite.name} hit by enemy!`);

        // Eliminate the player (works for human or bot)
        // playerSprite is the Phaser sprite, which extends BasePlayer
        if (playerSprite.isAlive() && !this.gameOver) {
            playerSprite.eliminate('ENEMY_COLLISION');
            // Game over will be triggered by the update loop checking isHumanAlive()
        }
    }

    // Get current oil percentage
    getOilPercentage() {
        return (this.currentOil / this.maxOil) * 100;
    }

    // Get current score
    getScore() {
        return this.score;
    }

    /**
     * Update spatial partition with all alive entities
     * Called each frame for efficient spatial queries by bot AI (Phase 6: Optimization #1)
     */
    updateSpatialPartition() {
        // Clear previous frame's data
        this.spatialPartition.clear();

        // Insert all alive players
        this.playerManager.getAlivePlayers().forEach(player => {
            this.spatialPartition.insert(player, 'player');
        });

        // Insert all active enemies (Optimization #1: enable spatial queries)
        if (this.enemies) {
            this.enemies.getChildren().forEach(enemy => {
                if (enemy.active) {
                    this.spatialPartition.insert(enemy, 'enemy');
                }
            });
        }

        // Insert all active oil pickups (Optimization #1: enable spatial queries)
        if (this.oilPickupManager) {
            const activePickups = this.oilPickupManager.getActiveSprites();
            activePickups.forEach(pickup => {
                if (pickup.active && pickup.visible) {
                    this.spatialPartition.insert(pickup, 'pickup');
                }
            });
        }
    }

    /**
     * Toggle debug/testing mode (press 'T' key)
     */
    toggleDebugMode() {
        DebugConfig.toggle();

        // Update ambient lighting based on debug mode
        if (DebugConfig.isFeatureEnabled('fullVisibility')) {
            // Brighten ambient light to see everything
            this.lights.setAmbientColor(DebugConfig.visual.fullVisibilityAmbient);
            console.log('[CaveScene] Debug mode: Full visibility ENABLED');
        } else {
            // Restore dark cave ambient
            this.lights.setAmbientColor(this.originalAmbientColor);
            console.log('[CaveScene] Debug mode: Full visibility DISABLED');
        }

        // Show/hide debug info
        if (DebugConfig.enabled) {
            console.log('[CaveScene] Debug mode: Press T to toggle off');
            console.log('[CaveScene] Debug features:', DebugConfig.features);
        } else {
            // Clean up debug visualizations
            this.debugGraphics.clear();
            this.cleanupDebugLabels();
        }
    }

    /**
     * Clean up debug text labels
     */
    cleanupDebugLabels() {
        // Clean up map-based labels
        for (const [playerId, label] of this.debugPlayerLabelMap.entries()) {
            label.destroy();
        }
        this.debugPlayerLabelMap.clear();

        // Clean up old array-based labels (for backward compatibility)
        if (this.debugPlayerLabels) {
            this.debugPlayerLabels.forEach(label => {
                if (label && label.destroy) {
                    label.destroy();
                }
            });
            this.debugPlayerLabels = [];
        }
    }

    /**
     * Update debug visualizations (called every frame if debug mode is on)
     */
    updateDebugVisuals() {
        if (!DebugConfig.enabled) return;

        // Clear previous frame's debug drawings
        this.debugGraphics.clear();

        // Draw light radius indicator around human player
        if (DebugConfig.isFeatureEnabled('showLightRadius') && this.player) {
            const currentRadius = this.lanternLight.radius;

            // Convert world position to screen position
            const screenX = this.player.x - this.cameras.main.scrollX;
            const screenY = this.player.y - this.cameras.main.scrollY;

            // Draw circle outline showing light radius
            this.debugGraphics.lineStyle(2, DebugConfig.visual.lightRadiusColor, 1);
            this.debugGraphics.strokeCircle(screenX, screenY, currentRadius);

            // Draw filled circle with transparency
            this.debugGraphics.fillStyle(DebugConfig.visual.lightRadiusColor, DebugConfig.visual.lightRadiusAlpha);
            this.debugGraphics.fillCircle(screenX, screenY, currentRadius);
        }

        // Show player names above their heads
        if (DebugConfig.isFeatureEnabled('showPlayerNames')) {
            this.updatePlayerNameLabels();
        }
    }

    /**
     * Update player name labels (optimized - only creates/destroys when needed)
     */
    updatePlayerNameLabels() {
        const alivePlayers = this.playerManager.getAlivePlayers();
        const alivePlayerIds = new Set(alivePlayers.map(p => p.playerId));

        // Remove labels for dead players
        for (const [playerId, label] of this.debugPlayerLabelMap.entries()) {
            if (!alivePlayerIds.has(playerId)) {
                label.destroy();
                this.debugPlayerLabelMap.delete(playerId);
            }
        }

        // Update or create labels for alive players
        alivePlayers.forEach(player => {
            let label = this.debugPlayerLabelMap.get(player.playerId);

            if (!label) {
                // Create new label
                label = this.add.text(
                    player.x,
                    player.y - 30,
                    player.name,
                    DebugConfig.visual.nameTextStyle
                );
                label.setOrigin(0.5, 0.5);
                label.setDepth(1001);
                this.debugPlayerLabelMap.set(player.playerId, label);
            } else {
                // Just update position (very cheap!)
                label.setPosition(player.x, player.y - 30);
            }
        });
    }
}
