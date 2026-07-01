import { Physics } from 'phaser';

/**
 * BasePlayer - Abstract base class for all player types (human and bots)
 * Handles shared logic: oil depletion, state management, sprite setup
 */
export class BasePlayer extends Physics.Arcade.Sprite {
    constructor(scene, x, y, playerId, name) {
        // Spritesheet + anims are loaded/registered in Preloader. Frame 0 is
        // idle-down — a sensible default starting pose.
        super(scene, x, y, 'player', 0);

        // Player identification
        this.playerId = playerId;
        this.name = name || `Player${playerId}`;
        this.isHuman = false; // Override in HumanPlayer

        // Add to scene
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // Enable lighting on player sprite. No per-player tint: every player
        // is a grey-cloaked figure with a warm lamp baked into the sprite art.
        this.setPipeline('Light2D');

        // Facing direction drives which row of the spritesheet animates.
        // Persists across stops so the idle pose matches the last walking direction.
        this.facing = 'down';
        this._currentAnimKey = null;

        // Player state
        this.state = 'ALIVE'; // 'ALIVE' | 'DEAD'

        // Movement properties
        this.speed = 150; // Movement speed in pixels per second
        this.setCollideWorldBounds(true);

        // Oil/fuel system
        this.maxOil = 100;
        this.currentOil = 100;
        this.oilDepletionRate = 5; // Oil units consumed per second (tuned for longer games)

        // Score tracking
        this.score = 0;
        this.scoreTimer = 0; // Accumulator for score increments
        this.survivalTime = 0; // Total survival time in seconds

        // Elimination data
        this.eliminationReason = null; // 'OIL_DEPLETED' | 'ENEMY_COLLISION'
        this.eliminationTime = null;
        this.finalRank = null;

        console.log(`[BasePlayer] Created ${this.name} at (${x}, ${y})`);
    }

    /**
     * Map a playerId to a tint color. Human (id=0) stays yellow; everyone else
     * gets a deterministic hue in the warm range. Accepts numeric ids (bots) or
     * string ids (RemotePlayer's "remote_<socketId>").
     */
    static tintForPlayerId(playerId) {
        if (playerId === 0) return 0xffff00;

        let hash;
        if (typeof playerId === 'number') {
            hash = playerId;
        } else {
            hash = 0;
            const s = String(playerId);
            for (let i = 0; i < s.length; i++) {
                hash = ((hash * 31) + s.charCodeAt(i)) & 0x7fffffff;
            }
        }
        const hue = 20 + (hash % 80); // 20-100: red-orange through yellow-green
        return Phaser.Display.Color.HSLToColor(hue / 360, 0.75, 0.55).color;
    }

    /**
     * Update method - must be implemented by subclasses
     */
    update(delta) {
        throw new Error('BasePlayer.update() must be implemented by subclass');
    }

    /**
     * Shared update logic for all players
     * Handles oil depletion, score increment, survival time
     */
    updateCommon(delta) {
        if (this.state !== 'ALIVE') return;

        // Drive walk/idle animation — purely client-side, runs in both modes.
        this.updateVisuals(this.body.velocity.x, this.body.velocity.y);

        const deltaSeconds = delta / 1000;

        // In MP mode the server is authoritative for oil, eliminations, and score —
        // the client just reflects what arrives in world_snapshots. Locally driving
        // these counters causes drift between snapshots and can fire spurious
        // eliminate('OIL_DEPLETED') when the local copy hits 0 before the next
        // snapshot resets it. Skip the local accounting entirely.
        if (this.scene.isMultiplayer) {
            this.survivalTime += deltaSeconds; // visual-only, kept for UI
            return;
        }

        // Deplete oil over time
        this.currentOil -= this.oilDepletionRate * deltaSeconds;
        this.currentOil = Math.max(0, this.currentOil);

        // Increment score (1 point per second)
        this.scoreTimer += deltaSeconds;
        if (this.scoreTimer >= 1) {
            this.score += 1;
            this.scoreTimer -= 1;
        }

        // Track survival time
        this.survivalTime += deltaSeconds;

        // Check for oil depletion elimination
        if (this.currentOil <= 0) {
            this.eliminate('OIL_DEPLETED');
        }
    }

    /**
     * Drive 4-direction facing + walk animation from a velocity vector. Called
     * by updateCommon for local/bot players and by RemotePlayer with velocity
     * derived from interpolated position deltas.
     */
    updateVisuals(vx, vy /* , delta */) {
        const speedSq = vx * vx + vy * vy;
        const isMoving = speedSq > 4; // 2px/s deadzone, squared

        if (isMoving) {
            // Pick dominant axis so diagonal movement still snaps to a single
            // facing direction instead of flickering between two.
            if (Math.abs(vx) > Math.abs(vy)) {
                this.facing = vx < 0 ? 'left' : 'right';
            } else {
                this.facing = vy < 0 ? 'up' : 'down';
            }
        }

        const animKey = `player-${isMoving ? 'walk' : 'idle'}-${this.facing}`;
        if (this._currentAnimKey !== animKey) {
            this.anims.play(animKey, true);
            this._currentAnimKey = animKey;
        }
    }

    /**
     * Add oil to the player's tank
     */
    addOil(amount) {
        if (this.state !== 'ALIVE') return;

        this.currentOil = Math.min(this.maxOil, this.currentOil + amount);
        console.log(`[${this.name}] Collected oil. Current: ${this.currentOil.toFixed(1)}/${this.maxOil}`);
    }

    /**
     * Get current oil percentage
     */
    getOilPercentage() {
        return (this.currentOil / this.maxOil) * 100;
    }

    /**
     * Eliminate this player from the game
     */
    eliminate(reason) {
        if (this.state === 'DEAD') return; // Already eliminated

        console.log(`[${this.name}] Eliminated: ${reason}`);

        this.state = 'DEAD';
        this.eliminationReason = reason;
        this.eliminationTime = Date.now();

        // Hide sprite and disable physics
        this.setVisible(false);
        this.body.enable = false;

        // Emit elimination event for the scene to handle
        this.scene.events.emit('player-eliminated', this, reason);
    }

    /**
     * Check if player is alive
     */
    isAlive() {
        return this.state === 'ALIVE';
    }

    /**
     * Get player state data for UI/debugging
     */
    getState() {
        return {
            playerId: this.playerId,
            name: this.name,
            state: this.state,
            position: { x: this.x, y: this.y },
            oil: this.currentOil,
            oilPercent: this.getOilPercentage(),
            score: this.score,
            survivalTime: this.survivalTime,
            eliminationReason: this.eliminationReason,
            finalRank: this.finalRank
        };
    }
}
