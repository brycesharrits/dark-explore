import seedrandom from 'seedrandom';
import { SERVER_CONFIG } from '../config/ServerConfig.js';
import { PhysicsResolver } from './PhysicsResolver.js';

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
            const a = rooms[i];
            const b = rooms[i + 1];

            // Horizontal corridor
            const startX = Math.min(a.cx, b.cx);
            const endX = Math.max(a.cx, b.cx);
            for (let x = startX; x <= endX; x++) {
                for (let dy = -Math.floor(corridorWidth / 2); dy <= Math.floor(corridorWidth / 2); dy++) {
                    set(x, a.cy + dy, 0);
                }
            }

            // Vertical corridor
            const startY = Math.min(a.cy, b.cy);
            const endY = Math.max(a.cy, b.cy);
            for (let y = startY; y <= endY; y++) {
                for (let dx = -Math.floor(corridorWidth / 2); dx <= Math.floor(corridorWidth / 2); dx++) {
                    set(b.cx + dx, y, 0);
                }
            }
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

        // --- Generate player spawns (20 is plenty for BOT_FILL_TO=10) ---
        const playerSpawns = WorldGenerator._generateSpawnPositions(wallGrid, between, 20);

        // --- Generate oil pickup positions ---
        const oilPickups = WorldGenerator._generatePickupPositions(wallGrid, rng, PICKUP_COUNT);

        // --- Generate power-up positions ---
        const powerUps = WorldGenerator._generatePowerUpPositions(wallGrid, rng, POWER_UP_COUNT);

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

    static _generateSpawnPositions(wallGrid, between, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 4;
        const minDist = 80;
        const r = 16; // player radius to check corners
        const spawns = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            let valid = false;

            do {
                x = between(padding, worldW - padding);
                y = between(padding, worldH - padding);
                attempts++;

                // Check center and all 4 corners for wall overlap
                const corners = [
                    { x, y },
                    { x: x - r, y: y - r },
                    { x: x + r, y: y - r },
                    { x: x - r, y: y + r },
                    { x: x + r, y: y + r }
                ];
                const onWall = corners.some(c => PhysicsResolver.isWall(c.x, c.y, wallGrid));

                const tooClose = spawns.some(s => {
                    const dx = s.x - x;
                    const dy = s.y - y;
                    return dx * dx + dy * dy < minDist * minDist;
                });

                if (!onWall && !tooClose) {
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

    static _generatePickupPositions(wallGrid, rng, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 2;
        const pickups = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            do {
                x = Math.floor(rng() * (worldW - padding * 2)) + padding;
                y = Math.floor(rng() * (worldH - padding * 2)) + padding;
                attempts++;
            } while (attempts < 500 && PhysicsResolver.isWall(x, y, wallGrid));

            pickups.push({ id: i, x, y });
        }

        return pickups;
    }

    static _generatePowerUpPositions(wallGrid, rng, count) {
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;
        const padding = TILE_SIZE * 3;
        const powerUps = [];

        for (let i = 0; i < count; i++) {
            let x, y, attempts = 0;
            do {
                x = Math.floor(rng() * (worldW - padding * 2)) + padding;
                y = Math.floor(rng() * (worldH - padding * 2)) + padding;
                attempts++;
            } while (attempts < 500 && PhysicsResolver.isWall(x, y, wallGrid));

            const type = WorldGenerator._selectPowerUpType(rng);
            powerUps.push({ id: i, x, y, type });
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
