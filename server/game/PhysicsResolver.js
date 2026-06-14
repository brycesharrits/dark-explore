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
    static resolve(entity, wallGrid, radius = PLAYER_RADIUS) {
        const r = radius;
        const worldW = GRID_WIDTH * TILE_SIZE;
        const worldH = GRID_HEIGHT * TILE_SIZE;

        // Clamp to world bounds first
        entity.x = Math.max(r, Math.min(worldW - r, entity.x));
        entity.y = Math.max(r, Math.min(worldH - r, entity.y));

        if (!wallGrid) return { hitX: false, hitY: false };

        let hitX = false;
        let hitY = false;

        // Check 4 corners of entity AABB
        const corners = [
            { x: entity.x - r, y: entity.y - r },
            { x: entity.x + r, y: entity.y - r },
            { x: entity.x - r, y: entity.y + r },
            { x: entity.x + r, y: entity.y + r }
        ];

        for (const corner of corners) {
            const tx = Math.floor(corner.x / TILE_SIZE);
            const ty = Math.floor(corner.y / TILE_SIZE);

            if (tx < 0 || tx >= GRID_WIDTH || ty < 0 || ty >= GRID_HEIGHT) continue;

            if (wallGrid[ty * GRID_WIDTH + tx] === 1) {
                const tileCX = (tx + 0.5) * TILE_SIZE;
                const tileCY = (ty + 0.5) * TILE_SIZE;

                const dx = entity.x - tileCX;
                const dy = entity.y - tileCY;

                const overlapX = TILE_SIZE / 2 + r - Math.abs(dx);
                const overlapY = TILE_SIZE / 2 + r - Math.abs(dy);

                if (overlapX > 0 && overlapY > 0) {
                    if (overlapX < overlapY) {
                        entity.x += Math.sign(dx) * overlapX;
                        hitX = true;
                    } else {
                        entity.y += Math.sign(dy) * overlapY;
                        hitY = true;
                    }
                }
            }
        }

        return { hitX, hitY };
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
