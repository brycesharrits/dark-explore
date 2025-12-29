/**
 * EliminationTracker - Tracks player eliminations, rankings, and victory conditions
 * Phase 6: Battle royale style tracking system
 */
export class EliminationTracker {
    constructor(scene) {
        this.scene = scene;
        this.eliminations = []; // Array of elimination records
        this.totalPlayers = 0; // Total players at start of game
        this.currentRank = 0; // Current rank to assign (50th, 49th, etc.)

        console.log('[EliminationTracker] Initialized');
    }

    /**
     * Initialize tracker with total player count
     * Called when game starts
     */
    initialize(totalPlayers) {
        this.totalPlayers = totalPlayers;
        this.currentRank = totalPlayers; // Start from last place
        this.eliminations = [];

        console.log(`[EliminationTracker] Tracking ${totalPlayers} players`);
    }

    /**
     * Record a player elimination
     * @param {BasePlayer} player - The eliminated player
     * @param {string} reason - Reason for elimination ('OUT_OF_OIL', 'ENEMY_COLLISION')
     * @param {number} time - Game time when eliminated
     */
    recordElimination(player, reason, time) {
        const elimination = {
            playerName: player.name,
            isHuman: player.isHuman,
            reason: reason,
            time: time,
            rank: this.currentRank,
            score: player.score || 0,
            oilRemaining: player.currentOil || 0
        };

        this.eliminations.push(elimination);
        this.currentRank--; // Next elimination will be one rank higher

        console.log(`[EliminationTracker] ${player.name} eliminated - Rank #${elimination.rank} (${reason})`);

        return elimination;
    }

    /**
     * Get the number of players still alive
     */
    getAlivePlayers() {
        return this.totalPlayers - this.eliminations.length;
    }

    /**
     * Check if there's a winner (only 1 player left)
     */
    hasWinner() {
        return this.getAlivePlayers() === 1;
    }

    /**
     * Get the winner (if game is over)
     * Returns the last alive player's data
     */
    getWinner() {
        if (!this.hasWinner()) {
            return null;
        }

        // Winner is the player who wasn't eliminated
        // We can identify them by checking who's still alive in the scene
        const alivePlayers = this.scene.playerManager.getAlivePlayers();
        if (alivePlayers.length === 1) {
            const winner = alivePlayers[0];
            return {
                playerName: winner.name,
                isHuman: winner.isHuman,
                rank: 1,
                score: winner.score || 0,
                oilRemaining: winner.currentOil || 0
            };
        }

        return null;
    }

    /**
     * Get human player's final rank (if eliminated)
     */
    getHumanRank() {
        const humanElimination = this.eliminations.find(e => e.isHuman);
        return humanElimination ? humanElimination.rank : null;
    }

    /**
     * Get human player's elimination record
     */
    getHumanElimination() {
        return this.eliminations.find(e => e.isHuman) || null;
    }

    /**
     * Get recent eliminations (for kill feed)
     * @param {number} count - Number of recent eliminations to get
     */
    getRecentEliminations(count = 5) {
        return this.eliminations.slice(-count).reverse(); // Most recent first
    }

    /**
     * Get elimination statistics
     */
    getStats() {
        // Count eliminations by reason
        const reasonCounts = {};
        this.eliminations.forEach(e => {
            reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1;
        });

        return {
            totalEliminations: this.eliminations.length,
            playersAlive: this.getAlivePlayers(),
            eliminationsByReason: reasonCounts,
            hasWinner: this.hasWinner()
        };
    }

    /**
     * Format elimination reason for display
     */
    static formatReason(reason) {
        const reasonMap = {
            'OUT_OF_OIL': 'ran out of oil',
            'ENEMY_COLLISION': 'hit by enemy'
        };
        return reasonMap[reason] || reason.toLowerCase();
    }

    /**
     * Get ordinal suffix for rank (1st, 2nd, 3rd, etc.)
     */
    static getOrdinalSuffix(rank) {
        const j = rank % 10;
        const k = rank % 100;

        if (j === 1 && k !== 11) {
            return rank + 'st';
        }
        if (j === 2 && k !== 12) {
            return rank + 'nd';
        }
        if (j === 3 && k !== 13) {
            return rank + 'rd';
        }
        return rank + 'th';
    }
}
