import { SERVER_CONFIG } from '../config/ServerConfig.js';
import { WorldGenerator } from '../game/WorldGenerator.js';
import { ServerGameState } from '../game/ServerGameState.js';
import { ServerPlayerState } from '../game/ServerPlayerState.js';
import { PhysicsResolver } from '../game/PhysicsResolver.js';

const {
    TICK_INTERVAL_MS, OIL_DEPLETION_RATE, MAX_OIL,
    PLAYER_SPEED, BOT_FILL_TO, COUNTDOWN_SECONDS, ENEMY_SPAWN_DELAY,
    BOT_UPDATE_INTERVAL, BOT_SMART_RATIO
} = SERVER_CONFIG;

export class GameRoom {
    constructor(roomId, io) {
        this.roomId = roomId;
        this.io = io;

        this.status = 'WAITING'; // WAITING | COUNTDOWN | PLAYING | FINISHED
        this.players = new Map();   // socketId -> { socket, playerState }
        this.playerCount = 0;

        this.gameState = null;
        this.worldData = null;
        this.tickInterval = null;
        this.countdownTimeout = null;
        this.enemySpawnTimeout = null;
        this.aliveCount = 0;

        console.log(`[GameRoom ${roomId}] Created`);
    }

    // -----------------------------------------------------------------------
    // Player join / leave
    // -----------------------------------------------------------------------

    addPlayer(socket, displayName) {
        if (this.status !== 'WAITING' && this.status !== 'COUNTDOWN') return false;
        if (this.players.size >= SERVER_CONFIG.ROOM_CAPACITY) return false;

        this.players.set(socket.id, { socket, displayName });
        socket.join(this.roomId);

        // Broadcast lobby update
        this.broadcastLobbyUpdate();

        // Start countdown when first player joins
        if (this.players.size === 1) {
            this.startCountdown();
        }

        console.log(`[GameRoom ${this.roomId}] ${displayName} (${socket.id}) joined. ${this.players.size} players`);
        return true;
    }

    removePlayer(socketId) {
        const entry = this.players.get(socketId);
        if (!entry) return;

        console.log(`[GameRoom ${this.roomId}] ${entry.displayName} left`);
        this.players.delete(socketId);

        if (this.gameState) {
            this.gameState.removePlayer(socketId);
            this.io.to(this.roomId).emit('player_disconnected', { playerId: socketId });
        }

        if (this.players.size === 0) {
            this.destroy();
        }
    }

    handleInput(socketId, inputData) {
        if (this.status !== 'PLAYING') return;
        const playerState = this.gameState?.players.get(socketId);
        if (!playerState) return;
        playerState.pendingInput = inputData;
        playerState.lastProcessedSeq = inputData.seq;
    }

    // -----------------------------------------------------------------------
    // Countdown
    // -----------------------------------------------------------------------

    startCountdown() {
        this.status = 'COUNTDOWN';
        this._countdownStartMs = Date.now();
        const totalMs = COUNTDOWN_SECONDS * 1000;
        const stepMs = 200;

        const tick = () => {
            const elapsed = Date.now() - this._countdownStartMs;
            const remainingMs = Math.max(0, totalMs - elapsed);
            this.broadcastLobbyUpdate(Math.ceil(remainingMs / 1000));
            if (remainingMs <= 0) {
                this.startGame();
            } else {
                this.countdownTimeout = setTimeout(tick, stepMs);
            }
        };

        tick();
    }

    broadcastLobbyUpdate(countdownSeconds = null) {
        const playerList = Array.from(this.players.entries()).map(([id, p]) => ({
            id,
            name: p.displayName,
            isBot: false
        }));

        // Mid-countdown, animate filler bots into the lobby so the visible
        // roster grows from `humans` up to BOT_FILL_TO. These are display-only
        // — actual bot game objects are created in startGame().
        if (this.status === 'COUNTDOWN' && this._countdownStartMs != null) {
            const totalMs = COUNTDOWN_SECONDS * 1000;
            const elapsed = Math.min(totalMs, Date.now() - this._countdownStartMs);
            const progress = totalMs > 0 ? elapsed / totalMs : 1;
            const slotsLeft = Math.max(0, BOT_FILL_TO - playerList.length);
            const fillerCount = Math.round(progress * slotsLeft);
            for (let i = 0; i < fillerCount; i++) {
                playerList.push({ id: `bot_${i}`, name: `Bot${i + 1}`, isBot: true });
            }
        }

        this.io.to(this.roomId).emit('lobby_update', { players: playerList, countdownSeconds });
    }

    // -----------------------------------------------------------------------
    // Game start
    // -----------------------------------------------------------------------

    startGame() {
        if (this.status === 'PLAYING') return;
        this.status = 'PLAYING';

        clearTimeout(this.countdownTimeout);

        // Generate world
        this.worldData = WorldGenerator.generate();
        this.gameState = new ServerGameState(this.worldData);

        // Assign human player spawns
        const humanIds = Array.from(this.players.keys());
        const spawns = this.worldData.playerSpawns;

        humanIds.forEach((socketId, i) => {
            const spawn = spawns[i] || spawns[0];
            const { displayName } = this.players.get(socketId);
            const playerState = new ServerPlayerState(socketId, displayName, spawn.x, spawn.y, false);
            this.gameState.addPlayer(playerState);
        });

        // Fill remaining slots with bots
        const botCount = Math.max(0, BOT_FILL_TO - humanIds.length);
        for (let i = 0; i < botCount; i++) {
            const spawnIdx = humanIds.length + i;
            const spawn = spawns[spawnIdx % spawns.length];
            const botId = `bot_${i}`;
            const botName = `Bot${i + 1}`;
            const bot = new ServerPlayerState(botId, botName, spawn.x, spawn.y, true);
            this.gameState.addPlayer(bot);
        }

        this.aliveCount = this.gameState.aliveCount;

        // Send game_start to all human players with their assigned spawn
        humanIds.forEach((socketId, i) => {
            const spawn = spawns[i] || spawns[0];
            const { socket } = this.players.get(socketId);
            socket.emit('game_start', {
                playerId: socketId,
                spawnX: spawn.x,
                spawnY: spawn.y,
                rooms: this.worldData.rooms,
                oilPickups: this.worldData.oilPickups,
                powerUps: this.worldData.powerUps,
                players: Array.from(this.gameState.players.values()).map(p => ({
                    id: p.id,
                    name: p.name,
                    isBot: p.isBot,
                    x: p.x,
                    y: p.y
                }))
            });
        });

        // Start enemy spawning after delay
        this.enemySpawnTimeout = setTimeout(() => {
            this.enemiesActive = true;
        }, ENEMY_SPAWN_DELAY);

        // Start game loop
        this.tickInterval = setInterval(() => this.tick(), TICK_INTERVAL_MS);

        console.log(`[GameRoom ${this.roomId}] Game started with ${this.gameState.aliveCount} players`);
    }

    // -----------------------------------------------------------------------
    // Tick loop
    // -----------------------------------------------------------------------

    tick() {
        if (this.status !== 'PLAYING') return;

        const dtMs = TICK_INTERVAL_MS;
        const dt = dtMs / 1000;
        const events = [];

        // --- Update enemies ---
        if (this.enemiesActive) {
            this.gameState.updateEnemies(dtMs);
        }

        // --- Process each alive player ---
        for (const player of this.gameState.getAlivePlayers()) {
            // Apply power-up timers
            this.gameState.updatePlayerPowerUpTimers(player, dtMs);

            if (player.isBot) {
                this._updateBot(player, dtMs);
            } else {
                this._applyInput(player, dt);
            }

            // Wall collision
            PhysicsResolver.resolve(player, this.gameState.wallGrid);

            // Oil depletion
            player.oil -= OIL_DEPLETION_RATE * dt;
            player.oil = Math.max(0, player.oil);

            // Score
            player.scoreTimer += dt;
            if (player.scoreTimer >= 1) {
                player.score += 1;
                player.scoreTimer -= 1;
            }
            player.survivalTime += dt;

            // Check oil death
            if (player.oil <= 0) {
                const elim = this._eliminatePlayer(player, 'OIL_DEPLETED');
                events.push(elim);
                continue;
            }

            // Check enemy collision
            if (this.enemiesActive && this.gameState.checkEnemyCollisions(player)) {
                const elim = this._eliminatePlayer(player, 'ENEMY_COLLISION');
                events.push(elim);
                continue;
            }

            // Check pickup collisions
            const pickupEvents = this.gameState.checkPickupCollisions(player);
            events.push(...pickupEvents);
        }

        // Update pickup respawns and power-up expirations
        const respawnEvents = this.gameState.updatePickupRespawns();
        events.push(...respawnEvents);

        // Build and broadcast snapshot
        const snapshot = this.gameState.buildSnapshot();
        this.io.to(this.roomId).emit('world_snapshot', snapshot);

        // Broadcast discrete events
        for (const event of events) {
            this.io.to(this.roomId).emit(event.type, event);
        }

        // Check for game over
        if (this.aliveCount <= 1 && this.status === 'PLAYING') {
            this._endGame();
        }
    }

    _applyInput(player, dt) {
        const input = player.pendingInput;
        if (!input) return;

        let vx = 0, vy = 0;
        if (input.left)  vx -= 1;
        if (input.right) vx += 1;
        if (input.up)    vy -= 1;
        if (input.down)  vy += 1;

        // Normalize diagonal
        if (vx !== 0 && vy !== 0) {
            vx *= 0.707;
            vy *= 0.707;
        }

        const speed = player.getEffectiveSpeed();
        player.x += vx * speed * dt;
        player.y += vy * speed * dt;
    }

    _updateBot(bot, dtMs) {
        bot.botDirectionTimer -= dtMs;

        // Periodically choose a new direction
        if (bot.botDirectionTimer <= 0) {
            bot.botDirectionTimer = BOT_UPDATE_INTERVAL + Math.random() * 500;

            // Simple AI: move toward nearest oil pickup if low oil, otherwise random
            if (bot.oil < 40) {
                const nearestPickup = this._findNearestActivePickup(bot);
                if (nearestPickup) {
                    const dx = nearestPickup.x - bot.x;
                    const dy = nearestPickup.y - bot.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    bot.botDirection = { vx: dx / len, vy: dy / len };
                } else {
                    bot.botDirection = this._randomDirection();
                }
            } else {
                bot.botDirection = this._randomDirection();
            }
        }

        const speed = bot.getEffectiveSpeed();
        const dt = dtMs / 1000;
        bot.x += bot.botDirection.vx * speed * dt;
        bot.y += bot.botDirection.vy * speed * dt;
    }

    _findNearestActivePickup(bot) {
        let nearest = null;
        let nearestDist = Infinity;

        for (const pickup of this.gameState.oilPickups) {
            if (pickup.state !== 'ACTIVE') continue;
            const dx = pickup.x - bot.x;
            const dy = pickup.y - bot.y;
            const dist = dx * dx + dy * dy;
            if (dist < nearestDist) {
                nearestDist = dist;
                nearest = pickup;
            }
        }

        return nearest;
    }

    _randomDirection() {
        const angle = Math.random() * Math.PI * 2;
        return { vx: Math.cos(angle), vy: Math.sin(angle) };
    }

    _eliminatePlayer(player, reason) {
        player.state = 'DEAD';
        player.oil = 0;
        this.aliveCount = Math.max(0, this.aliveCount - 1);
        player.finalRank = this.aliveCount + 1;

        console.log(`[GameRoom ${this.roomId}] ${player.name} eliminated: ${reason}. ${this.aliveCount} alive`);

        return {
            type: 'player_eliminated',
            playerId: player.id,
            playerName: player.name,
            reason,
            rank: player.finalRank,
            aliveCount: this.aliveCount
        };
    }

    _endGame() {
        if (this.status !== 'PLAYING') return;
        this.status = 'FINISHED';

        clearInterval(this.tickInterval);
        clearTimeout(this.enemySpawnTimeout);

        const alivePlayers = this.gameState.getAlivePlayers();
        const winner = alivePlayers[0];

        const finalRankings = Array.from(this.gameState.getAllPlayers())
            .sort((a, b) => (a.finalRank || 999) - (b.finalRank || 999))
            .map(p => ({
                id: p.id,
                name: p.name,
                rank: p.finalRank,
                score: p.score
            }));

        this.io.to(this.roomId).emit('game_over', {
            winnerId: winner?.id || null,
            winnerName: winner?.name || 'Nobody',
            finalRankings
        });

        console.log(`[GameRoom ${this.roomId}] Game over. Winner: ${winner?.name || 'Nobody'}`);

        // Clean up after delay
        setTimeout(() => this.destroy(), 30000);
    }

    // -----------------------------------------------------------------------
    // Cleanup
    // -----------------------------------------------------------------------

    destroy() {
        clearInterval(this.tickInterval);
        clearTimeout(this.countdownTimeout);
        clearTimeout(this.enemySpawnTimeout);
        this.status = 'FINISHED';
        console.log(`[GameRoom ${this.roomId}] Destroyed`);
    }

    isFull() {
        return this.players.size >= SERVER_CONFIG.ROOM_CAPACITY;
    }

    isEmpty() {
        return this.players.size === 0;
    }
}
