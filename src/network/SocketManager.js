import { io } from 'socket.io-client';

/**
 * SocketManager - Wraps the Socket.IO client connection.
 * All scenes interact with the network through this singleton.
 * Fires prefixed events on itself so Phaser scenes can subscribe cleanly.
 */
export class SocketManager extends EventTarget {
    constructor() {
        super();
        this.socket = null;
        this.connected = false;
        this.playerId = null;
        this.roomId = null;

        // Input state tracked each frame
        this._inputSeq = 0;
        this._lastInput = { up: false, down: false, left: false, right: false };
    }

    // -----------------------------------------------------------------------
    // Connection
    // -----------------------------------------------------------------------

    connect() {
        if (this.socket) return;

        this.socket = io({ path: '/socket.io' });

        this.socket.on('connect', () => {
            console.log('[SocketManager] Connected:', this.socket.id);
            this.connected = true;
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SocketManager] Disconnected:', reason);
            this.connected = false;
        });

        // --- Lobby events ---
        this.socket.on('room_joined', (data) => {
            this.playerId = data.playerId;
            this.roomId = data.roomId;
            this._emit('net:room_joined', data);
        });

        this.socket.on('lobby_update', (data) => {
            this._emit('net:lobby_update', data);
        });

        // --- Game events ---
        this.socket.on('game_start', (data) => {
            this._emit('net:game_start', data);
        });

        this.socket.on('world_snapshot', (data) => {
            this._emit('net:world_snapshot', data);
        });

        this.socket.on('player_eliminated', (data) => {
            this._emit('net:player_eliminated', data);
        });

        this.socket.on('pickup_collected', (data) => {
            this._emit('net:pickup_collected', data);
        });

        this.socket.on('powerup_collected', (data) => {
            this._emit('net:powerup_collected', data);
        });

        this.socket.on('powerup_expired', (data) => {
            this._emit('net:powerup_expired', data);
        });

        this.socket.on('game_over', (data) => {
            this._emit('net:game_over', data);
        });

        this.socket.on('player_disconnected', (data) => {
            this._emit('net:player_disconnected', data);
        });

        this.socket.on('error', (data) => {
            console.error('[SocketManager] Server error:', data);
            this._emit('net:error', data);
        });
    }

    disconnect() {
        this.socket?.disconnect();
        this.socket = null;
        this.connected = false;
    }

    // -----------------------------------------------------------------------
    // Lobby actions
    // -----------------------------------------------------------------------

    joinLobby(displayName) {
        this.socket?.emit('join_lobby', { displayName });
    }

    // -----------------------------------------------------------------------
    // Input sending (called every frame from CaveScene.update)
    // -----------------------------------------------------------------------

    sendInput(cursors, wasd) {
        if (!this.connected) return;

        const input = {
            up:    cursors.up.isDown    || wasd.up.isDown,
            down:  cursors.down.isDown  || wasd.down.isDown,
            left:  cursors.left.isDown  || wasd.left.isDown,
            right: cursors.right.isDown || wasd.right.isDown
        };

        // Only send if input changed (or every few frames to keep server in sync)
        const changed = input.up    !== this._lastInput.up    ||
                        input.down  !== this._lastInput.down  ||
                        input.left  !== this._lastInput.left  ||
                        input.right !== this._lastInput.right;

        if (changed || this._inputSeq % 4 === 0) {
            this._inputSeq++;
            this.socket.emit('player_input', {
                seq: this._inputSeq,
                ...input,
                timestamp: Date.now()
            });
            this._lastInput = { ...input };
        }
    }

    // -----------------------------------------------------------------------
    // Event helpers
    // -----------------------------------------------------------------------

    on(eventName, callback) {
        this.addEventListener(eventName, (e) => callback(e.detail));
    }

    off(eventName, callback) {
        this.removeEventListener(eventName, callback);
    }

    _emit(eventName, data) {
        this.dispatchEvent(Object.assign(new Event(eventName), { detail: data }));
    }
}
