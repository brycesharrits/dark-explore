import { SERVER_CONFIG } from '../config/ServerConfig.js';

const { TILE_SIZE, GRID_WIDTH, GRID_HEIGHT, PLAYER_RADIUS } = SERVER_CONFIG;

/**
 * Resolves player position against wall grid using simple AABB clamping.
 * Also clamps to world bounds.
 */
export class PhysicsResolver {
    /**
     * @param {ServerPlayerState} player
     * @param {Uint8Array} wallGrid - 1 = wall, 0 = floor (row-major: y * GRID_WIDTH + x)
     */
    static resolve(player, wallGrid) {
        const r = PLAYER_RADIUS;
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;

        // Clamp to world bounds first
        player.x = Math.max(r, Math.min(worldW - r, player.x));
        player.y = Math.max(r, Math.min(worldH - r, player.y));

        if (!wallGrid) return;

        // Check 4 corners of player AABB
        const corners = [
            { x: player.x - r, y: player.y - r },
            { x: player.x + r, y: player.y - r },
            { x: player.x - r, y: player.y + r },
            { x: player.x + r, y: player.y + r }
        ];

        for (const corner of corners) {
            const tx = Math.floor(corner.x / TILE_SIZE);
            const ty = Math.floor(corner.y / TILE_SIZE);

            if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) continue;

            if (wallGrid[ty * GRID_WIDTH + tx] === 1) {
                // Tile center
                const tileCX = (tx + 0.5) * TILE_SIZE;
                const tileCY = (ty + 0.5) * TILE_SIZE;

                const dx = player.x - tileCX;
                const dy = player.y - tileCY;

                const overlapX = TILE_SIZE / 2 + r - Math.abs(dx);
                const overlapY = TILE_SIZE / 2 + r - Math.abs(dy);

                if (overlapX > 0 && overlapY > 0) {
                    if (overlapX < overlapY) {
                        player.x += Math.sign(dx) * overlapX;
                    } else {
                        player.y += Math.sign(dy) * overlapY;
                    }
                }
            }
        }
    }

    /**
     * Check if a position overlaps a wall tile (for pickup placement)
     */
    static isWall(x, y, wallGrid) {
        const tx = Math.floor(x / TILE_SIZE);
        const ty = Math.floor(y / TILE_SIZE);
        if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) return true;
        return wallGrid[ty * GRID_WIDTH + tx] === 1;
    }
}
