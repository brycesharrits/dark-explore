import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';
import { SERVER_CONFIG } from './config/ServerConfig.js';

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST']
    }
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
    console.log(`[Server] Client connected: ${socket.id}`);

    socket.on('join_lobby', (data) => {
        roomManager.handleJoin(socket, data);
    });

    socket.on('player_input', (data) => {
        roomManager.handleInput(socket, data);
    });

    socket.on('disconnect', () => {
        console.log(`[Server] Client disconnected: ${socket.id}`);
        roomManager.handleDisconnect(socket);
    });
});

httpServer.listen(SERVER_CONFIG.PORT, () => {
    console.log(`[Server] Dark Explore game server running on port ${SERVER_CONFIG.PORT}`);
});
