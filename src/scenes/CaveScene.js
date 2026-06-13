import { Scene } from 'phaser';
import { CaveEnemy } from '../gameobjects/CaveEnemy';
import { PlayerManager } from '../managers/PlayerManager';
import { DebugConfig } from '../config/DebugConfig';
import { SpatialPartition } from '../utils/SpatialPartition';
import { OilPickupManager } from '../managers/OilPickupManager';
import { PowerUpManager } from '../managers/PowerUpManager';
import { EliminationTracker } from '../managers/EliminationTracker';
import { EliminationFeed } from '../ui/EliminationFeed';

export class CaveScene extends Scene {
    // Static variable to store high score across game sessions (for the current browser session)
    static sessionHighScore = 0;

    constructor() {
        super({ key: 'CaveScene' });
        this.tileSize = 32; // Size of each tile in pixels
        this.gridWidth = 80; // Number of tiles wide
        this.gridHeight = 80; // Number of tiles tall

        // Game state
        this.gameStarted = false; // Track if game has started
        this.gameOver = false; // Track if game is over
        this.score = 0; // Current score
        this.scoreTimer = 0; // Timer for score increments

        // Lantern system properties
        this.maxOil = 100; // Maximum oil capacity
        this.currentOil = 100; // Current oil level (starts full)
        this.oilDepletionRate = 6; // Oil units consumed per second - 2 is default
        this.maxLightRadius = 290; // Maximum light radius in pixels (+21% from original 240)
        this.minLightRadius = 20; // Minimum light radius before game over (legacy - used for calculations)
        this.minRadiusBeforeDim = 97; // Minimum radius before dimming starts (+21% from original 80)
        this.maxLightIntensity = 1.5; // Maximum light intensity

        // Oil pickup properties (Phase 5: managed by OilPickupManager)
        this.numOilPickups = 30; // Number of oil pickups
        this.oilPickupManager = null; // Manager for oil pickups with respawn

        // Power-up properties
        this.numPowerUps = 6; // Number of power-ups (less common than oil)
        this.powerUpManager = null; // Manager for power-ups

        // Elimination tracking (Phase 6)
        this.eliminationTracker = null; // Tracks eliminations and rankings
        this.eliminationFeed = null; // Visual feed for eliminations
        this.victoryAchieved = false; // Track if victory condition has been met

        // Enemy properties
        this.enemySpawnDelay = 5000; // Spawn enemies after 5 seconds (in milliseconds)
        this.enemySpawnTimer = null; // Timer for spawning enemies
        this.enemies = null; // Group to hold enemies
        this.numEnemies = 15; // Number of enemies

        // Debug/testing mode
        this.debugGraphics = null; // Graphics object for debug visualizations
        this.originalAmbientColor = 0x0a0a0a; // Store original ambient color
        this.debugPlayerLabels = []; // Array of debug text labels for players

        // Full vision power-up indicator
        this.fullVisionIndicatorActive = false; // When true, show light radius circle

        // Multiplayer
        this.isMultiplayer = false;
        this.socketManager = null;
        this.localPlayerId = null;
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

        // Reset power-up states
        this.fullVisionIndicatorActive = false;

        // Check multiplayer mode from registry
        this.isMultiplayer = this.game.registry.get('isMultiplayer') || false;
        this.socketManager = this.game.registry.get('socketManager') || null;
        this.localPlayerId = null;

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

        // Enable collision between player and walls (stored so setupMultiplayerCollisions can replace it)
        console.log('[CaveScene] Setting up wall collision...');
        this.wallCollider = this.physics.add.collider(this.player, this.tileLayer);

        // Create the lantern/visibility system
        console.log('[CaveScene] Creating lantern system...');
        this.createLanternSystem(worldWidth, worldHeight);

        // Create oil pickups with respawn system (Phase 5)
        console.log('[CaveScene] Initializing OilPickupManager...');
        this.oilPickupManager = new OilPickupManager(this);
        if (!this.isMultiplayer) {
            // Solo mode: spawn randomly. MP mode: server provides positions at game_start.
            this.oilPickupManager.spawnPickups(this.numOilPickups);
        }

        // Create power-ups
        console.log('[CaveScene] Initializing PowerUpManager...');
        this.powerUpManager = new PowerUpManager(this);
        if (!this.isMultiplayer) {
            this.powerUpManager.spawnPowerUps(this.numPowerUps);
        }

        // Initialize elimination tracker (Phase 6)
        console.log('[CaveScene] Initializing EliminationTracker...');
        this.eliminationTracker = new EliminationTracker(this);

        // Initialize elimination feed UI (Phase 6)
        console.log('[CaveScene] Initializing EliminationFeed...');
        this.eliminationFeed = new EliminationFeed(this);

        // Listen for player elimination events. Remove any prior binding first so
        // restarts within the same session don't accumulate listeners — a duplicate
        // listener double-counts eliminations and triggers a premature winner.
        this.events.off('player-eliminated', this.onPlayerEliminated, this);
        this.events.on('player-eliminated', this.onPlayerEliminated, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.events.off('player-eliminated', this.onPlayerEliminated, this);
        });

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
        const startMsg = this.isMultiplayer ? 'Connecting to server...' : 'Use arrow keys to begin';
        this.startText = this.add.text(
            20,
            20,
            startMsg,
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

        // Set up multiplayer socket listeners
        if (this.isMultiplayer && this.socketManager) {
            this.setupMultiplayerListeners();
        }

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

        // Step 5: Generate maze layout (floor + walls)
        // serverRooms is null in solo mode; set before createTileGrid() in MP mode
        this.generateMaze(layer, this._pendingServerRooms || null);

        // Step 6: Enable collision on wall tiles (tile index 2)
        layer.setCollisionByExclusion([0, 1]); // Everything except floor tiles collides

        // Step 7: Enable lighting on the tilemap layer
        layer.setPipeline('Light2D');

        // Store reference for potential future use
        this.tileMap = map;
        this.tileLayer = layer;

        console.log('[CaveScene] createTileGrid() complete - Tilemap with automatic chunking enabled');
    }

    /**
     * Generate maze layout with rooms and corridors.
     * In multiplayer mode, serverRooms is provided by the server for determinism.
     * @param {TilemapLayer} layer
     * @param {Array|null} serverRooms - [{x, y, width, height}, ...] from server, or null for solo
     */
    generateMaze(layer, serverRooms = null) {
        console.log('[CaveScene] Generating maze layout...');

        // Step 1: Fill entire map with walls
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                layer.putTileAt(2, x, y); // Tile 2 = wall
            }
        }

        // Step 2: Create or use rooms
        let rooms;
        if (serverRooms && serverRooms.length > 0) {
            // Use server-provided rooms exactly
            rooms = serverRooms;
        } else {
            // Solo mode: generate randomly
            rooms = [];
            const numRooms = Math.floor((this.gridWidth * this.gridHeight) / 400);
            const minRoomSize = 5;
            const maxRoomSize = 15;

            for (let i = 0; i < numRooms; i++) {
                const roomWidth = Phaser.Math.Between(minRoomSize, maxRoomSize);
                const roomHeight = Phaser.Math.Between(minRoomSize, maxRoomSize);
                const roomX = Phaser.Math.Between(2, this.gridWidth - roomWidth - 2);
                const roomY = Phaser.Math.Between(2, this.gridHeight - roomHeight - 2);
                rooms.push({ x: roomX, y: roomY, width: roomWidth, height: roomHeight });
            }
        }

        // Carve rooms and compute centers for corridor connection
        const roomCenters = [];
        for (const room of rooms) {
            for (let y = room.y; y < room.y + room.height; y++) {
                for (let x = room.x; x < room.x + room.width; x++) {
                    const floorTile = (x + y) % 2 === 0 ? 0 : 1;
                    layer.putTileAt(floorTile, x, y);
                }
            }
            roomCenters.push({
                x: room.x + Math.floor(room.width / 2),
                y: room.y + Math.floor(room.height / 2)
            });
        }

        // Step 3: Connect rooms with corridors
        for (let i = 0; i < roomCenters.length - 1; i++) {
            this.createCorridor(layer, roomCenters[i].x, roomCenters[i].y, roomCenters[i + 1].x, roomCenters[i + 1].y);
        }

        // Step 4: Ensure center starting area is clear
        const centerX = Math.floor(this.gridWidth / 2);
        const centerY = Math.floor(this.gridHeight / 2);
        const startingArea = 5;

        for (let y = centerY - startingArea; y <= centerY + startingArea; y++) {
            for (let x = centerX - startingArea; x <= centerX + startingArea; x++) {
                if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                    const floorTile = (x + y) % 2 === 0 ? 0 : 1;
                    layer.putTileAt(floorTile, x, y);
                }
            }
        }

        // Step 5: Join the center starting area to the room chain so it isn't an island
        if (roomCenters.length > 0) {
            let nearest = roomCenters[0];
            let bestDist = Infinity;
            for (const c of roomCenters) {
                const dx = c.x - centerX;
                const dy = c.y - centerY;
                const d = dx * dx + dy * dy;
                if (d < bestDist) {
                    bestDist = d;
                    nearest = c;
                }
            }
            this.createCorridor(layer, centerX, centerY, nearest.x, nearest.y);
        }

        // Step 6: Compute reachability mask via flood-fill from the player's start
        this._computeReachableMask(layer, centerX, centerY);

        console.log(`[CaveScene] Maze generated with ${rooms.length} rooms`);
    }

    /**
     * Flood-fill from the player's starting tile to mark every reachable floor tile.
     * Result stored as Uint8Array on this.reachableMask (1 = reachable).
     */
    _computeReachableMask(layer, startTx, startTy) {
        const w = this.gridWidth;
        const h = this.gridHeight;
        const mask = new Uint8Array(w * h);

        const isWallTile = (tx, ty) => {
            if (tx < 0 || tx >= w || ty < 0 || ty >= h) return true;
            const tile = layer.getTileAt(tx, ty);
            return !tile || tile.index === 2;
        };

        if (isWallTile(startTx, startTy)) {
            this.reachableMask = mask;
            return;
        }

        const queue = [startTx, startTy];
        mask[startTy * w + startTx] = 1;

        while (queue.length > 0) {
            const ty = queue.pop();
            const tx = queue.pop();
            const neighbors = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
                const idx = ny * w + nx;
                if (mask[idx] || isWallTile(nx, ny)) continue;
                mask[idx] = 1;
                queue.push(nx, ny);
            }
        }

        this.reachableMask = mask;
    }

    /**
     * True if the entire footprint (center + 4 corners at radius r) is on reachable floor.
     * Used to gate pickup/power-up/spawn placement so they never appear in walls or
     * disconnected pockets.
     */
    isFootprintReachable(worldX, worldY, radius) {
        if (!this.reachableMask) return false;
        const w = this.gridWidth;
        const h = this.gridHeight;
        const ts = this.tileSize;

        const points = [
            [worldX, worldY],
            [worldX - radius, worldY - radius], [worldX + radius, worldY - radius],
            [worldX - radius, worldY + radius], [worldX + radius, worldY + radius]
        ];
        for (const [px, py] of points) {
            const tx = Math.floor(px / ts);
            const ty = Math.floor(py / ts);
            if (tx < 0 || tx >= w || ty < 0 || ty >= h) return false;
            if (this.reachableMask[ty * w + tx] !== 1) return false;
        }
        return true;
    }

    /**
     * Create L-shaped corridor between two points
     */
    createCorridor(layer, x1, y1, x2, y2) {
        const corridorWidth = 2;

        // Horizontal corridor
        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        for (let x = startX; x <= endX; x++) {
            for (let dy = -Math.floor(corridorWidth / 2); dy <= Math.floor(corridorWidth / 2); dy++) {
                const y = y1 + dy;
                if (y >= 0 && y < this.gridHeight) {
                    const floorTile = (x + y) % 2 === 0 ? 0 : 1;
                    layer.putTileAt(floorTile, x, y);
                }
            }
        }

        // Vertical corridor
        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        for (let y = startY; y <= endY; y++) {
            for (let dx = -Math.floor(corridorWidth / 2); dx <= Math.floor(corridorWidth / 2); dx++) {
                const x = x2 + dx;
                if (x >= 0 && x < this.gridWidth) {
                    const floorTile = (x + y) % 2 === 0 ? 0 : 1;
                    layer.putTileAt(floorTile, x, y);
                }
            }
        }
    }

    /**
     * Create tileset texture for the tilemap (Optimization #2)
     * Generates a small texture with 3 tile variants: floor tiles + wall
     */
    createTilesetTexture() {
        // Create graphics object to draw tiles
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Tile 0: Light gray floor with border
        graphics.fillStyle(0x555555, 1);
        graphics.fillRect(0, 0, this.tileSize, this.tileSize);
        graphics.lineStyle(1, 0x333333, 0.5);
        graphics.strokeRect(0, 0, this.tileSize, this.tileSize);

        // Tile 1: Dark gray floor with border
        graphics.fillStyle(0x444444, 1);
        graphics.fillRect(this.tileSize, 0, this.tileSize, this.tileSize);
        graphics.lineStyle(1, 0x333333, 0.5);
        graphics.strokeRect(this.tileSize, 0, this.tileSize, this.tileSize);

        // Tile 2: Wall tile (darker with thicker border for depth)
        graphics.fillStyle(0x222222, 1); // Very dark gray
        graphics.fillRect(this.tileSize * 2, 0, this.tileSize, this.tileSize);
        graphics.lineStyle(2, 0x111111, 1); // Thick dark border
        graphics.strokeRect(this.tileSize * 2, 0, this.tileSize, this.tileSize);
        // Add inner highlight for 3D effect
        graphics.lineStyle(1, 0x333333, 0.8);
        graphics.strokeRect(this.tileSize * 2 + 2, 2, this.tileSize - 4, this.tileSize - 4);

        // Generate texture from graphics (3 tiles side by side)
        graphics.generateTexture('cave-tileset', this.tileSize * 3, this.tileSize);
        graphics.destroy();

        console.log('[CaveScene] Tileset texture created: 3 tiles @', this.tileSize, 'x', this.tileSize);
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

        // Create a point light at player position (starts off — flickers on when game begins)
        this.lanternLight = this.lights.addLight(0, 0, 0, 0xffffff, 0);
        this.lanternLit = false;

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

    /**
     * Handle power-up collection
     */
    collectPowerUp(playerSprite, powerUpSprite) {
        // Delegate to PowerUpManager
        this.powerUpManager.collectPowerUp(powerUpSprite, playerSprite);
    }

    updateLightMask() {
        // Don't drive light values while the flicker animation is playing
        if (!this.lanternLit) {
            if (this.player) {
                this.lanternLight.setPosition(this.player.x, this.player.y);
            }
            return;
        }

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
            // Check if game should start (solo: arrow key press; MP: server event only)
            if (!this.gameStarted) {
                if (!this.isMultiplayer) {
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

            // Send input to server in multiplayer mode
            if (this.isMultiplayer && this.socketManager) {
                this.socketManager.sendInput(this.cursors, this.wasd);
            }

            // Update oil pickups (respawn timers handled by server in MP mode)
            this.oilPickupManager.update(delta);

            // Update power-ups (respawn timers handled by server in MP mode)
            if (!this.isMultiplayer) {
                this.powerUpManager.update(delta);
            }

            // For compatibility, sync scene-level variables with human player
            // (These will be removed in later phases)
            this.currentOil = this.player.currentOil;
            this.score = this.player.score;

            // Update the light mask to reflect new position and oil level
            this.updateLightMask();

            // Check if human player was eliminated (solo mode only; MP uses server events)
            if (!this.isMultiplayer && !this.playerManager.isHumanAlive() && !this.gameOver) {
                console.log('[CaveScene] Game Over - human player eliminated!');
                this.handleGameOver();
            }
        }

        // Update debug visualizations (if debug mode is enabled)
        this.updateDebugVisuals();
    }

    startGame(mpData = null) {
        console.log('[CaveScene] Starting game!');
        this.gameStarted = true;

        // Remove start text
        if (this.startText) {
            this.startText.destroy();
            this.startText = null;
        }

        if (mpData) {
            // --- Multiplayer mode ---
            // Teleport player to server-assigned spawn, then snap camera so there's no lerp zoom
            if (this.player) {
                this.player.setPosition(mpData.spawnX, mpData.spawnY);
                this.cameras.main.centerOn(mpData.spawnX, mpData.spawnY);
            }

            // Spawn remote players for other humans
            for (const p of mpData.players) {
                if (p.id === this.localPlayerId || p.isBot) continue;
                this.playerManager.spawnRemotePlayer(p.id, p.name, p.x, p.y);
            }

            // Use server-provided pickup positions (collision set up by setupMultiplayerCollisions below)
            this.oilPickupManager.spawnAtPositions(mpData.oilPickups);

            const totalPlayers = mpData.players.length;
            this.eliminationTracker.initialize(totalPlayers);
            console.log(`[CaveScene] MP: tracker initialized for ${totalPlayers} players`);

        } else {
            // --- Solo mode ---
            console.log('[CaveScene] Spawning bots...');
            this.playerManager.spawnBots(99, 0.3);

            const totalPlayers = this.playerManager.players.length;
            this.eliminationTracker.initialize(totalPlayers);
            console.log(`[CaveScene] Elimination tracker initialized for ${totalPlayers} players`);
        }

        // Setup collision detection for all players (human + bots)
        this.setupMultiplayerCollisions();

        // Play lantern flicker effect now that we're at the correct spawn position
        this.playLanternFlicker();

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

        // Clean up any active full vision effect
        if (this.player && this.player.fullVisionActive) {
            this.powerUpManager.endFullVisionEffect(this.player);
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
        const padding = this.tileSize * 3;
        const enemyRadius = 10; // CaveEnemy visual radius
        const minDistFromPlayer = 200;
        const enemyCount = this.numEnemies || 15;

        for (let i = 0; i < enemyCount; i++) {
            let x, y, attempts = 0;
            let valid = false;
            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                attempts++;

                if (!this.isFootprintReachable(x, y, enemyRadius)) continue;

                const distanceFromPlayer = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
                if (distanceFromPlayer < minDistFromPlayer) continue;

                valid = true;
                break;
            } while (attempts < 200);

            if (!valid) continue;

            const enemy = new CaveEnemy(this, x, y);
            this.enemies.add(enemy);
        }

        console.log(`[CaveScene] Total enemies: ${this.enemies.getLength()}`);

        // Enemies collide with walls
        if (this.enemyWallCollider) {
            this.enemyWallCollider.destroy();
        }
        this.enemyWallCollider = this.physics.add.collider(this.enemies, this.tileLayer);

        // Enemies vs players (overlap → damage handler)
        this.enemyCollider = this.physics.add.overlap(
            this.allPlayerSprites || this.player,
            this.enemies,
            this.handleEnemyCollision,
            null,
            this
        );

        console.log('[CaveScene] Enemy wall + player collisions enabled');
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

        // Power-ups vs all players
        if (this.powerUpCollider) {
            this.powerUpCollider.destroy();
        }
        this.powerUpCollider = this.physics.add.overlap(
            allPlayerSprites,
            this.powerUpManager.getActiveSprites(),
            this.collectPowerUp,
            null,
            this
        );

        // Walls vs all players (including bots)
        if (this.wallCollider) {
            this.wallCollider.destroy();
        }
        this.wallCollider = this.physics.add.collider(allPlayerSprites, this.tileLayer);

        // Enemies vs all players (will be setup when enemies spawn)
        // Store reference for when spawnEnemies is called
        this.allPlayerSprites = allPlayerSprites;

        console.log(`[CaveScene] Collision detection enabled for ${allPlayerSprites.length} players (including walls)`);
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

        // Insert all active power-ups (enable spatial queries for bots)
        if (this.powerUpManager) {
            const activePowerUps = this.powerUpManager.getActiveSprites();
            activePowerUps.forEach(powerUp => {
                if (powerUp.active && powerUp.visible) {
                    this.spatialPartition.insert(powerUp, 'powerup');
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
        // BUT: Don't override if full vision power-up is active
        if (DebugConfig.isFeatureEnabled('fullVisibility')) {
            // Brighten ambient light to see everything
            this.lights.setAmbientColor(DebugConfig.visual.fullVisibilityAmbient);
            console.log('[CaveScene] Debug mode: Full visibility ENABLED');
        } else {
            // Only restore dark cave ambient if full vision power-up is NOT active
            if (!this.fullVisionIndicatorActive) {
                this.lights.setAmbientColor(this.originalAmbientColor);
                console.log('[CaveScene] Debug mode: Full visibility DISABLED - Darkness restored');
            } else {
                console.log('[CaveScene] Debug mode: Full visibility DISABLED - But full vision power-up is active');
            }
        }

        // Show/hide debug info
        if (DebugConfig.enabled) {
            console.log('[CaveScene] Debug mode: Press T to toggle off');
            console.log('[CaveScene] Debug features:', DebugConfig.features);
        } else {
            // Clean up debug visualizations (but keep full vision indicator if active)
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
     * Update debug visualizations (called every frame)
     */
    updateDebugVisuals() {
        // Always clear previous frame's debug drawings
        this.debugGraphics.clear();

        // Draw light radius indicator when full vision power-up is active
        if (this.fullVisionIndicatorActive && this.player && this.lanternLight) {
            const currentRadius = this.lanternLight.radius;

            // Convert world position to screen position
            const screenX = this.player.x - this.cameras.main.scrollX;
            const screenY = this.player.y - this.cameras.main.scrollY;

            // Draw circle outline showing light radius (yellow)
            this.debugGraphics.lineStyle(2, 0xffff00, 1);
            this.debugGraphics.strokeCircle(screenX, screenY, currentRadius);

            // Draw filled circle with transparency
            this.debugGraphics.fillStyle(0xffff00, 0.3);
            this.debugGraphics.fillCircle(screenX, screenY, currentRadius);
        }

        // Return early if debug mode is not enabled
        if (!DebugConfig.enabled) return;

        // Draw light radius indicator in debug mode (if not already drawn by full vision)
        if (DebugConfig.isFeatureEnabled('showLightRadius') && this.player && !this.fullVisionIndicatorActive) {
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

        // Show player names above their heads (only in debug mode)
        if (DebugConfig.isFeatureEnabled('showPlayerNames')) {
            this.updatePlayerNameLabels();
        }
    }

    // =========================================================================
    // LANTERN FLICKER
    // =========================================================================

    /**
     * Animate the lantern flickering on from darkness.
     * Uses a sequence of fast tweens to simulate a lantern catching light.
     * Also plays a synthetic spark/click sound via Web Audio API.
     */
    playLanternFlicker() {
        if (this.lanternLit) return;
        this.lanternLit = true;

        const light = this.lanternLight;
        const targetRadius = this.maxLightRadius;
        const targetIntensity = this.maxLightIntensity;

        // Flicker sequence: radius and intensity pulse quickly then settle
        const flickers = [
            { r: targetRadius * 0.6, i: 0.8, t: 60 },
            { r: 0,                  i: 0,   t: 80 },
            { r: targetRadius * 0.4, i: 0.5, t: 50 },
            { r: 0,                  i: 0,   t: 60 },
            { r: targetRadius * 0.9, i: 1.2, t: 70 },
            { r: targetRadius * 0.5, i: 0.4, t: 40 },
            { r: targetRadius,       i: targetIntensity, t: 200 }
        ];

        let delay = 0;
        for (const f of flickers) {
            this.time.delayedCall(delay, () => {
                light.setRadius(f.r);
                light.setIntensity(f.i);
            });
            delay += f.t;
        }

        // Play synthetic lantern ignition sound
        this.playLanternSound();
    }

    /**
     * Generate a synthetic lantern-click / spark sound using Web Audio API.
     */
    playLanternSound() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();

            const playClick = (startTime, freq, duration, gain) => {
                const osc = ctx.createOscillator();
                const gainNode = ctx.createGain();

                osc.connect(gainNode);
                gainNode.connect(ctx.destination);

                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, startTime);
                osc.frequency.exponentialRampToValueAtTime(freq * 0.1, startTime + duration);

                gainNode.gain.setValueAtTime(gain, startTime);
                gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            // A few quick scratchy clicks, then a warm settle
            playClick(now,        800,  0.05, 0.3);
            playClick(now + 0.08, 600,  0.04, 0.2);
            playClick(now + 0.14, 1200, 0.03, 0.15);
            playClick(now + 0.19, 500,  0.04, 0.25);
            playClick(now + 0.25, 300,  0.25, 0.4);  // warm settle
        } catch (e) {
            // Audio not available — silently skip
        }
    }

    // =========================================================================
    // MULTIPLAYER
    // =========================================================================

    /**
     * Set up Socket.IO event listeners for multiplayer mode.
     * Called once from create() when isMultiplayer is true.
     */
    setupMultiplayerListeners() {
        const sm = this.socketManager;

        sm.on('net:room_joined', (data) => {
            console.log('[CaveScene] Joined room:', data.roomId);
            this.localPlayerId = data.playerId;
            if (this.startText) {
                this.startText.setText('Waiting for players...');
            }
        });

        sm.on('net:lobby_update', (data) => {
            const count = data.players.length;
            const cd = data.countdownSeconds != null ? ` (${data.countdownSeconds}s)` : '';
            if (this.startText) {
                this.startText.setText(`Lobby: ${count} players${cd}`);
            }
        });

        sm.on('net:game_start', (data) => {
            this.localPlayerId = data.playerId;
            this._pendingServerRooms = data.rooms;
            this.startGame(data);
        });

        sm.on('net:world_snapshot', (data) => {
            if (!this.gameStarted) return;
            this.playerManager.applySnapshot(data.players, this.localPlayerId);

            // Apply dirty pickup state changes
            if (data.oilPickups) {
                for (const p of data.oilPickups) {
                    this.oilPickupManager.applyServerState(p.id, p.state);
                }
            }
        });

        sm.on('net:player_eliminated', (data) => {
            if (!this.gameStarted) return;

            const isLocal = data.playerId === this.localPlayerId;

            if (this.eliminationFeed) {
                this.eliminationFeed.addElimination(data.playerName, data.reason, data.rank);
            }

            if (isLocal && !this.gameOver) {
                // Handle local player elimination
                if (this.player) {
                    this.player.state = 'DEAD';
                    this.player.setVisible(false);
                    if (this.player.body) this.player.body.enable = false;
                }
                this.handleGameOver();
            }
        });

        sm.on('net:pickup_collected', (data) => {
            this.oilPickupManager.applyServerState(data.pickupId, 'COLLECTED');
        });

        sm.on('net:game_over', (data) => {
            if (this.gameOver) return;

            if (data.winnerId === this.localPlayerId) {
                this.victoryAchieved = true;
                this.handleVictory();
            } else if (!this.gameOver) {
                this.handleGameOver();
            }
        });

        // Join the lobby after setting up listeners
        const displayName = 'Player_' + Math.floor(Math.random() * 9999);
        sm.joinLobby(displayName);
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
