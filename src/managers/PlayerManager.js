import { HumanPlayer } from '../gameobjects/HumanPlayer.js';
import { SmartBot } from '../gameobjects/SmartBot.js';
import { DumbBot } from '../gameobjects/DumbBot.js';
import { RemotePlayer } from '../gameobjects/RemotePlayer.js';

/**
 * PlayerManager - Central management for all players (human and bots)
 * Handles spawning, tracking alive/dead state, elimination, and updates
 */
export class PlayerManager {
    constructor(scene) {
        this.scene = scene;

        // Player arrays
        this.players = []; // All players (human + bots)
        this.humanPlayer = null; // Reference to the human player
        this.botPlayers = []; // All bot players

        // Alive/dead tracking
        this.alivePlayers = new Set();
        this.deadPlayers = [];

        // Elimination tracking
        this.eliminationCount = 0;

        // Remote players (multiplayer mode)
        this.remotePlayers = new Map(); // remoteId -> RemotePlayer

        // Update optimization
        this.frameCount = 0;

        // Staggered update settings (Phase 3 optimization)
        this.botsPerFrameUpdate = 20; // Update 20 bots per frame
        this.currentBotUpdateIndex = 0; // Track which bots to update this frame

        // Keep alivePlayers in sync with BasePlayer.eliminate(). Players are hidden
        // but not destroyed on elimination, so the sprite 'destroy' event doesn't
        // fire — we rely on the scene event instead.
        this._onPlayerEliminated = (player) => {
            this.alivePlayers.delete(player);
            if (!this.deadPlayers.includes(player)) this.deadPlayers.push(player);
        };
        scene.events.on('player-eliminated', this._onPlayerEliminated);
        scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            scene.events.off('player-eliminated', this._onPlayerEliminated);
        });

        console.log('[PlayerManager] Initialized');
    }

    /**
     * Spawn the human player at a given position
     */
    spawnHumanPlayer(x, y) {
        console.log('[PlayerManager] Spawning human player...');

        this.humanPlayer = new HumanPlayer(this.scene, x, y);
        this.players.push(this.humanPlayer);
        this.alivePlayers.add(this.humanPlayer);

        console.log('[PlayerManager] Human player spawned');
        return this.humanPlayer;
    }

    /**
     * Spawn a remote player (multiplayer mode).
     * @param {string} id - socket ID
     * @param {string} name - display name
     * @param {number} x - starting x
     * @param {number} y - starting y
     */
    spawnRemotePlayer(id, name, x, y) {
        if (this.remotePlayers.has(id)) return this.remotePlayers.get(id);

        const remote = new RemotePlayer(this.scene, id, name, x, y);
        this.remotePlayers.set(id, remote);
        this.players.push(remote);
        this.alivePlayers.add(remote);

        // Wall collision
        this.scene.physics.add.collider(remote, this.scene.tileLayer);

        console.log(`[PlayerManager] Remote player spawned: ${name} (${id})`);
        return remote;
    }

    /**
     * Apply a world_snapshot to all players (multiplayer mode).
     * @param {Array} snapshotPlayers - array of player snapshot entries from server
     * @param {string} localPlayerId - this client's socket ID
     */
    applySnapshot(snapshotPlayers, localPlayerId) {
        for (const entry of snapshotPlayers) {
            if (entry.id === localPlayerId) {
                // Local player — apply server correction
                if (this.humanPlayer) {
                    this.humanPlayer.applyServerState(entry.x, entry.y, entry.oil, entry.speed);
                }
            } else {
                // Remote player — add snapshot for interpolation
                const remote = this.remotePlayers.get(entry.id);
                if (remote) {
                    if (entry.state === 'DEAD' && remote.state !== 'DEAD') {
                        remote.applyElimination();
                        this.alivePlayers.delete(remote);
                    } else {
                        remote.addSnapshot(entry.x, entry.y, entry.oil, entry.speed, Date.now());
                    }
                }
            }
        }
    }

    /**
     * Spawn bot players at random locations
     * @param {number} count - Number of bots to spawn
     * @param {number} smartRatio - Ratio of smart bots (default 0.3 = 30%)
     */
    spawnBots(count, smartRatio = 0.3) {
        console.log(`[PlayerManager] Spawning ${count} bots (${Math.floor(count * smartRatio)} smart, ${Math.floor(count * (1 - smartRatio))} dumb)...`);

        const worldWidth = this.scene.gridWidth * this.scene.tileSize;
        const worldHeight = this.scene.gridHeight * this.scene.tileSize;
        const padding = this.scene.tileSize * 3;
        const minSpawnDistance = 150; // Minimum distance between spawns
        const botRadius = 16; // bot footprint half-width

        // Get existing spawn positions (including human player)
        const existingSpawns = this.players.map(p => ({ x: p.x, y: p.y }));

        for (let i = 0; i < count; i++) {
            // Generate spawn position: reachable, not on a wall, far enough from other spawns
            let x, y, attempts = 0;
            const maxAttempts = 200;
            let valid = false;

            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                attempts++;

                if (!this.scene.isFootprintReachable(x, y, botRadius)) continue;

                const tooClose = existingSpawns.some(spawn => {
                    const dist = Phaser.Math.Distance.Between(x, y, spawn.x, spawn.y);
                    return dist < minSpawnDistance;
                });

                if (!tooClose) {
                    valid = true;
                    break;
                }
            } while (attempts < maxAttempts);

            if (!valid) continue;

            // Create bot (smart or dumb based on ratio)
            const playerId = this.players.length; // ID is based on total player count
            const isSmartBot = Math.random() < smartRatio;

            let bot;
            if (isSmartBot) {
                bot = new SmartBot(this.scene, x, y, playerId);
            } else {
                bot = new DumbBot(this.scene, x, y, playerId);
            }

            // Add to arrays
            this.players.push(bot);
            this.botPlayers.push(bot);
            this.alivePlayers.add(bot);
            existingSpawns.push({ x, y });

            console.log(`[PlayerManager] Spawned ${bot.name} (${isSmartBot ? 'Smart' : 'Dumb'}) at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        }

        console.log(`[PlayerManager] Total players: ${this.players.length} (1 human + ${this.botPlayers.length} bots)`);
    }

    /**
     * Update all players with staggered updates for performance
     * Phase 3: Only updates a subset of bots per frame (20 bots)
     */
    updateAll(cursors, wasd, delta) {
        // Always update human player every frame
        if (this.humanPlayer && this.humanPlayer.isAlive()) {
            this.humanPlayer.update(cursors, wasd, delta);
        }

        // Update remote players (interpolation)
        for (const remote of this.remotePlayers.values()) {
            if (remote.isAlive()) {
                remote.update(delta);
            }
        }

        // Staggered bot updates (Phase 3 optimization)
        // Update only a subset of bots per frame to spread CPU load
        const totalBots = this.botPlayers.length;

        if (totalBots > 0) {
            // Calculate how many bots to update this frame
            const botsToUpdate = Math.min(this.botsPerFrameUpdate, totalBots);

            // Calculate start and end indices for this frame's bot updates
            const startIdx = this.currentBotUpdateIndex;
            const endIdx = Math.min(startIdx + botsToUpdate, totalBots);

            // Update bots in range
            for (let i = startIdx; i < endIdx; i++) {
                const bot = this.botPlayers[i];
                if (bot.isAlive()) {
                    bot.update(delta);
                }
            }

            // Move to next batch for next frame
            this.currentBotUpdateIndex = endIdx;

            // Wrap around to beginning if we reached the end
            if (this.currentBotUpdateIndex >= totalBots) {
                this.currentBotUpdateIndex = 0;
            }
        }

        this.frameCount++;
    }

    /**
     * Eliminate a player from the game
     */
    eliminatePlayer(player, reason) {
        if (!this.alivePlayers.has(player)) {
            return; // Already eliminated
        }

        console.log(`[PlayerManager] Eliminating ${player.name}: ${reason}`);

        // Remove from alive set
        this.alivePlayers.delete(player);
        this.deadPlayers.push(player);
        this.eliminationCount++;

        // Calculate rank (1st = last alive, 100th = first eliminated)
        const rank = this.alivePlayers.size + 1;
        player.finalRank = rank;

        console.log(`[PlayerManager] ${player.name} placed #${rank}. ${this.alivePlayers.size} players remaining`);

        // Emit elimination event for the scene
        this.scene.events.emit('player-eliminated', player, reason, rank);
    }

    /**
     * Get count of alive players
     */
    getAliveCount() {
        return this.alivePlayers.size;
    }

    /**
     * Get all alive players as an array
     */
    getAlivePlayers() {
        return Array.from(this.alivePlayers);
    }

    /**
     * Get all alive players as a Phaser group (for collision detection)
     */
    getAliveGroup() {
        // For Phase 1, return array with just human player
        // Phase 2+ will return group of all alive players
        return this.getAlivePlayers().map(p => p);
    }

    /**
     * Get player's current rank
     * Rank is based on score among alive players
     */
    getRank(player) {
        const alivePlayers = this.getAlivePlayers();

        // Sort by score descending
        const sorted = alivePlayers.sort((a, b) => b.score - a.score);

        // Find player's rank
        const rank = sorted.findIndex(p => p.playerId === player.playerId) + 1;

        return rank > 0 ? rank : alivePlayers.length; // Fallback to last if not found
    }

    /**
     * Check if human player is alive
     */
    isHumanAlive() {
        return this.humanPlayer && this.humanPlayer.isAlive();
    }

    /**
     * Get game statistics
     */
    getStats() {
        return {
            totalPlayers: this.players.length,
            aliveCount: this.alivePlayers.size,
            deadCount: this.deadPlayers.length,
            eliminationCount: this.eliminationCount
        };
    }
}
