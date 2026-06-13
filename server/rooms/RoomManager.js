import { GameRoom } from './GameRoom.js';

export class RoomManager {
    constructor(io) {
        this.io = io;
        this.rooms = new Map();  // roomId -> GameRoom
        this.socketToRoom = new Map(); // socketId -> roomId

        // Track room IDs
        this._nextRoomId = 1;
    }

    handleJoin(socket, data) {
        const displayName = (data?.displayName || `Player_${socket.id.slice(0, 5)}`).slice(0, 20);

        // Find an available room or create one
        let room = this._findAvailableRoom();
        if (!room) {
            room = this._createRoom();
        }

        const joined = room.addPlayer(socket, displayName);
        if (!joined) {
            socket.emit('error', { message: 'Could not join room' });
            return;
        }

        this.socketToRoom.set(socket.id, room.roomId);

        socket.emit('room_joined', {
            roomId: room.roomId,
            playerId: socket.id,
            players: Array.from(room.players.entries()).map(([id, p]) => ({
                id,
                name: p.displayName,
                isBot: false
            }))
        });

        console.log(`[RoomManager] ${displayName} joined room ${room.roomId}`);
    }

    handleInput(socket, inputData) {
        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        room?.handleInput(socket.id, inputData);
    }

    handleDisconnect(socket) {
        const roomId = this.socketToRoom.get(socket.id);
        if (!roomId) return;

        const room = this.rooms.get(roomId);
        if (room) {
            room.removePlayer(socket.id);
            if (room.isEmpty()) {
                this.rooms.delete(roomId);
                console.log(`[RoomManager] Room ${roomId} removed (empty)`);
            }
        }

        this.socketToRoom.delete(socket.id);
    }

    _findAvailableRoom() {
        for (const room of this.rooms.values()) {
            if (room.status === 'WAITING' || room.status === 'COUNTDOWN') {
                if (!room.isFull()) return room;
            }
        }
        return null;
    }

    _createRoom() {
        const roomId = `room_${this._nextRoomId++}`;
        const room = new GameRoom(roomId, this.io);
        this.rooms.set(roomId, room);
        console.log(`[RoomManager] Created room ${roomId}`);
        return room;
    }
}
