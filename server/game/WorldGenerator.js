import seedrandom from 'seedrandom';
import { SERVER_CONFIG } from '../config/ServerConfig.js';

const { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, PICKUP_COUNT, POWER_UP_COUNT, POWER_UP_TYPES } = SERVER_CONFIG;

export class WorldGenerator {
    /**
     * Generate a complete world: rooms, wall grid, pickup/spawn positions.
     * @param {number|string} seed - RNG seed (random if null)
     * @returns {object} world data
     */
    static generate(seed = null) {
        const worldSeed = seed ?? Math.floor(Math.random() * 1_000_000);
        const rng = seedrandom(String(worldSeed));

        const between = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

        // --- Build wall grid ---
        const wallGrid = new Uint8Array(GRID_WIDTH * GRID_HEIGHT).fill(1); // all walls

        const set = (tx, ty, val) => {
            if (tx >= 0 && tx < GRID_WIDTH && ty >= 0 && ty < GRID_HEIGHT) {
                wallGrid[ty * GRID_WIDTH + tx] = val;
            }
        };

        const isWallTile = (tx, ty) => {
            if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return true;
            return wallGrid[ty * GRID_WIDTH + tx] === 1;
        };

        // --- Generate rooms (mirrors CaveScene.generateMaze logic) ---
        const numRooms = Math.floor((GRID_WIDTH * GRID_HEIGHT) / 400);
        const minRoomSize = 5;
        const maxRoomSize = 15;
        const rooms = [];

        for (let i = 0; i < numRooms; i++) {
            const roomWidth = between(minRoomSize, maxRoomSize);
            const roomHeight = between(minRoomSize, maxRoomSize);
            const roomX = between(2, GRID_WIDTH - roomWidth - 2);
            const roomY = between(2, GRID_HEIGHT - roomHeight - 2);

            for (let y = roomY; y < roomY + roomHeight; y++) {
                for (let x = roomX; x < roomX + roomWidth; x++) {
                    set(x, y, 0);
                }
            }

            rooms.push({
                x: roomX,
                y: roomY,
                width: roomWidth,
                height: roomHeight,
                cx: roomX + Math.floor(roomWidth / 2),
                cy: roomY + Math.floor(roomHeight / 2)
            });
        }

        // --- Connect rooms with L-shaped corridors ---
        const corridorWidth = 2;
        for (let i = 0; i < rooms.length - 1; i++) {
            WorldGenerator._carveCorridor(set, rooms[i].cx, rooms[i].cy, rooms[i + 1].cx, rooms[i + 1].cy, corridorWidth);
        }

        // --- Clear center starting area ---
        const centerX = Math.floor(GRID_WIDTH / 2);
        const centerY = Math.floor(GRID_HEIGHT / 2);
        const startArea = 5;
        for (let y = centerY - startArea; y <= centerY + startArea; y++) {
            for (let x = centerX - startArea; x <= centerX + startArea; x++) {
                set(x, y, 0);
            }
        }

        // --- Join center to room chain so the starting area isn't an island ---
        if (rooms.length > 0) {
            let nearest = rooms[0];
            let bestDist = Infinity;
            for (const room of rooms) {
                const dx = room.cx - centerX;
                const dy = room.cy - centerY;
                const d = dx * dx + dy * dy;
                if (d < bestDist) {
                    bestDist = d;
                    nearest = room;
                }
            }
            WorldGenerator._carveCorridor(set, centerX, centerY, nearest.cx, nearest.cy, corridorWidth);
        }

        // --- Reachability mask from the player's starting position ---
        const reachable = WorldGenerator._floodFillReachable(wallGrid, centerX, centerY);

        // --- Generate player spawns (20 is plenty for BOT_FILL_TO=10) ---
        const playerSpawns = WorldGenerator._generateSpawnPositions(wallGrid, reachable, between, 20);

        // --- Generate oil pickup positions ---
        const oilPickups = WorldGenerator._generatePickupPositions(wallGrid, reachable, rng, PICKUP_COUNT);

        // --- Generate power-up positions ---
        const powerUps = WorldGenerator._generatePowerUpPositions(wallGrid, reachable, rng, POWER_UP_COUNT);

        // Strip cx/cy from rooms before sending to client (not needed)
        const clientRooms = rooms.map(r => ({ x: r.x, y: r.y, width: r.width, height: r.height }));

        return {
            worldSeed,
            rooms: clientRooms,
            wallGrid,
            playerSpawns,
            oilPickups,
            powerUps
        };
    }

    /**
     * Carve an L-shaped corridor between two tile coordinates.
     * @param {Function} set - (tx, ty, val) closure that mutates the wall grid
     */
    static _carveCorridor(set, x1, y1, x2, y2, width = 2) {
        const half = Math.floor(width / 2);

        const startX = Math.min(x1, x2);
        const endX = Math.max(x1, x2);
        for (let x = startX; x <= endX; x++) {
            for (let dy = -half; dy <= half; dy++) {
                set(x, y1 + dy, 0);
            }
        }

        const startY = Math.min(y1, y2);
        const endY = Math.max(y1, y2);
        for (let y = startY; y <= endY; y++) {
            for (let dx = -half; dx <= half; dx++) {
                set(x2 + dx, y, 0);
            }
        }
    }

    /**
     * BFS flood-fill from a tile, returning a reachable mask (1 = reachable floor).
     */
    static _floodFillReachable(wallGrid, startTx, startTy) {
        const reachable = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
        const idx = (tx, ty) => ty * GRID_WIDTH + tx;

        if (startTx < 0 || startTx >= GRID_WIDTH || startTy < 0 || startTy >= GRID_HEIGHT) return reachable;
        if (wallGrid[idx(startTx, startTy)] === 1) return reachable;

        const queue = [startTx, startTy];
        reachable[idx(startTx, startTy)] = 1;

        while (queue.length > 0) {
            const ty = queue.pop();
            const tx = queue.pop();

            const neighbors = [[tx + 1, ty], [tx - 1, ty], [tx, ty + 1], [tx, ty - 1]];
            for (const [nx, ny] of neighbors) {
                if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
                const i = idx(nx, ny);
                if (reachable[i] || wallGrid[i] === 1) continue;
                reachable[i] = 1;
                queue.push(nx, ny);
            }
        }

        return reachable;
    }

    /**
     * True if the entire footprint (center + 4 corners offset by r) lies on reachable floor.
     */
    static _footprintReachable(x, y, r, reachable) {
        const points = [
            [x, y],
            [x - r, y - r], [x + r, y - r],
            [x - r, y + r], [x + r, y + r]
        ];
        for (const [px, py] of points) {
            const tx = Math.floor(px / TILE_SIZE);
            const ty = Math.floor(py / TILE_SIZE);
            if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return false;
            if (reachable[ty * GRID_WIDTH + tx] !== 1) return false;
        }
        return true;
    }

    static _generateSpawnPositions(wallGrid, reachable, between, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 4;
        const minDist = 80;
        const r = 16; // player radius
        const spawns = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            let valid = false;

            do {
                x = between(padding, worldW - padding);
                y = between(padding, worldH - padding);
                attempts++;

                if (!WorldGenerator._footprintReachable(x, y, r, reachable)) continue;

                const tooClose = spawns.some(s => {
                    const dx = s.x - x;
                    const dy = s.y - y;
                    return dx * dx + dy * dy < minDist * minDist;
                });

                if (!tooClose) {
                    valid = true;
                    break;
                }
            } while (attempts < 200);

            if (valid) {
                spawns.push({ x, y });
            }
        }

        return spawns;
    }

    static _generatePickupPositions(wallGrid, reachable, rng, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 2;
        const r = 8; // pickup sprite half-width
        const pickups = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            let valid = false;
            do {
                x = Math.floor(rng() * (worldW - padding * 2)) + padding;
                y = Math.floor(rng() * (worldH - padding * 2)) + padding;
                attempts++;
                if (WorldGenerator._footprintReachable(x, y, r, reachable)) {
                    valid = true;
                    break;
                }
            } while (attempts < 500);

            if (valid) pickups.push({ id: i, x, y });
        }

        return pickups;
    }

    static _generatePowerUpPositions(wallGrid, reachable, rng, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 3;
        const r = 12; // power-up sprite half-width
        const powerUps = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            let valid = false;
            do {
                x = Math.floor(rng() * (worldW - padding * 2)) + padding;
                y = Math.floor(rng() * (worldH - padding * 2)) + padding;
                attempts++;
                if (WorldGenerator._footprintReachable(x, y, r, reachable)) {
                    valid = true;
                    break;
                }
            } while (attempts < 500);

            if (valid) {
                const type = WorldGenerator._selectPowerUpType(rng);
                powerUps.push({ id: i, x, y, type });
            }
        }

        return powerUps;
    }

    static _selectPowerUpType(rng) {
        const roll = rng();
        let cumulative = 0;
        for (const entry of POWER_UP_TYPES) {
            cumulative += entry.weight;
            if (roll < cumulative) return entry.type;
        }
        return POWER_UP_TYPES[0].type;
    }
}
