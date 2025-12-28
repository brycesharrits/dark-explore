import { HumanPlayer } from '../gameobjects/HumanPlayer.js';
import { SmartBot } from '../gameobjects/SmartBot.js';
import { DumbBot } from '../gameobjects/DumbBot.js';

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

        // Update optimization
        this.frameCount = 0;

        // Staggered update settings (Phase 3 optimization)
        this.botsPerFrameUpdate = 20; // Update 20 bots per frame
        this.currentBotUpdateIndex = 0; // Track which bots to update this frame

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

        // Listen for elimination event
        this.humanPlayer.on('destroy', () => {
            this.alivePlayers.delete(this.humanPlayer);
        });

        console.log('[PlayerManager] Human player spawned');
        return this.humanPlayer;
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

        // Get existing spawn positions (including human player)
        const existingSpawns = this.players.map(p => ({ x: p.x, y: p.y }));

        for (let i = 0; i < count; i++) {
            // Generate spawn position with minimum distance from other players
            let x, y, attempts = 0;
            const maxAttempts = 50;

            do {
                x = Phaser.Math.Between(padding, worldWidth - padding);
                y = Phaser.Math.Between(padding, worldHeight - padding);
                attempts++;

                // Check distance from all existing spawns
                const tooClose = existingSpawns.some(spawn => {
                    const dist = Phaser.Math.Distance.Between(x, y, spawn.x, spawn.y);
                    return dist < minSpawnDistance;
                });

                if (!tooClose || attempts >= maxAttempts) {
                    break;
                }
            } while (attempts < maxAttempts);

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

            // Listen for elimination events
            bot.on('destroy', () => {
                this.alivePlayers.delete(bot);
            });

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
