import { BasePlayer } from './BasePlayer.js';

/**
 * RemotePlayer - Represents another human player received from the server.
 * Interpolates between server snapshots for smooth movement.
 * Does NOT process keyboard input.
 */
export class RemotePlayer extends BasePlayer {
    constructor(scene, id, name, x, y) {
        // Use a unique player ID for texture generation
        // Remote players get IDs starting from 1000 to avoid clashing with bot IDs
        const textureId = `remote_${id}`;
        super(scene, x, y, textureId, name);

        this.remoteId = id;
        this.isHuman = false; // Not locally controlled

        // Position interpolation buffer (stores last 3 server snapshots)
        this.positionBuffer = [];

        // Render 100ms behind server time to interpolate smoothly between snapshots
        this.interpolationDelay = 100;

        console.log(`[RemotePlayer] Created ${name} (${id}) at (${x}, ${y})`);
    }

    /**
     * Called when a new world_snapshot arrives for this player.
     */
    addSnapshot(x, y, oil, speed, timestamp) {
        this.positionBuffer.push({ x, y, oil, speed, timestamp });

        // Keep only the last 3 entries
        if (this.positionBuffer.length > 3) {
            this.positionBuffer.shift();
        }
    }

    /**
     * Update - interpolate toward buffered server position.
     * Called each frame from PlayerManager.
     */
    update(delta) {
        if (this.state !== 'ALIVE') return;

        if (this.positionBuffer.length < 2) {
            // Not enough data yet — stay at last known position
            return;
        }

        // Render time is server time - interpolationDelay
        const renderTime = Date.now() - this.interpolationDelay;

        // Find the two buffer entries that bracket renderTime
        let before = null;
        let after = null;

        for (let i = 0; i < this.positionBuffer.length - 1; i++) {
            if (this.positionBuffer[i].timestamp <= renderTime &&
                this.positionBuffer[i + 1].timestamp >= renderTime) {
                before = this.positionBuffer[i];
                after = this.positionBuffer[i + 1];
                break;
            }
        }

        if (!before || !after) {
            // Use the most recent snapshot
            const latest = this.positionBuffer[this.positionBuffer.length - 1];
            this.x = Phaser.Math.Linear(this.x, latest.x, 0.3);
            this.y = Phaser.Math.Linear(this.y, latest.y, 0.3);
            this.currentOil = latest.oil;
            return;
        }

        // Interpolation factor [0, 1]
        const t = (renderTime - before.timestamp) / (after.timestamp - before.timestamp);
        this.x = Phaser.Math.Linear(before.x, after.x, t);
        this.y = Phaser.Math.Linear(before.y, after.y, t);
        this.currentOil = Phaser.Math.Linear(before.oil, after.oil, t);
    }

    /**
     * Apply server elimination to this remote player.
     */
    applyElimination() {
        this.state = 'DEAD';
        if (this.scene && this.scene.playEliminationBurst) {
            this.scene.playEliminationBurst(this.x, this.y);
        }
        this.setVisible(false);
        if (this.body) this.body.enable = false;
    }
}
