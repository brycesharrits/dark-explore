/**
 * SpatialPartition - QuadTree implementation for efficient spatial queries
 * Reduces collision detection from O(n²) to O(n log n)
 *
 * Usage:
 * - Insert entities each frame
 * - Query for entities in a specific area
 * - Clear and rebuild each frame for dynamic entities
 */
export class SpatialPartition {
    constructor(bounds, capacity = 4) {
        // Bounds: { x, y, width, height }
        this.bounds = bounds;
        this.capacity = capacity; // Max entities before subdividing
        this.entities = []; // Entities in this node
        this.divided = false; // Has this node been subdivided?

        // Child nodes (created when subdividing)
        this.northeast = null;
        this.northwest = null;
        this.southeast = null;
        this.southwest = null;
    }

    /**
     * Insert an entity into the quadtree
     * @param {Object} entity - Entity with x, y properties
     * @param {string} entityType - Type identifier ('player', 'enemy', 'pickup')
     * @returns {boolean} - True if inserted successfully
     */
    insert(entity, entityType = 'unknown') {
        // Check if entity is within bounds
        if (!this.contains(entity)) {
            return false;
        }

        // Store entity type metadata (for filtering queries)
        if (!entity._spatialType) {
            entity._spatialType = entityType;
        }

        // If we have space and haven't divided, add it here
        if (this.entities.length < this.capacity && !this.divided) {
            this.entities.push(entity);
            return true;
        }

        // Otherwise, subdivide if needed and insert into children
        if (!this.divided) {
            this.subdivide();
        }

        // Try to insert into one of the children
        if (this.northeast.insert(entity, entityType)) return true;
        if (this.northwest.insert(entity, entityType)) return true;
        if (this.southeast.insert(entity, entityType)) return true;
        if (this.southwest.insert(entity, entityType)) return true;

        // Should never reach here if bounds checking is correct
        return false;
    }

    /**
     * Subdivide this node into 4 children
     */
    subdivide() {
        const x = this.bounds.x;
        const y = this.bounds.y;
        const w = this.bounds.width / 2;
        const h = this.bounds.height / 2;

        this.northeast = new SpatialPartition(
            { x: x + w, y: y, width: w, height: h },
            this.capacity
        );
        this.northwest = new SpatialPartition(
            { x: x, y: y, width: w, height: h },
            this.capacity
        );
        this.southeast = new SpatialPartition(
            { x: x + w, y: y + h, width: w, height: h },
            this.capacity
        );
        this.southwest = new SpatialPartition(
            { x: x, y: y + h, width: w, height: h },
            this.capacity
        );

        this.divided = true;

        // Re-insert entities into children
        const entitiesToReinsert = [...this.entities];
        this.entities = [];

        entitiesToReinsert.forEach(entity => {
            this.northeast.insert(entity) ||
            this.northwest.insert(entity) ||
            this.southeast.insert(entity) ||
            this.southwest.insert(entity);
        });
    }

    /**
     * Check if an entity is within this node's bounds
     */
    contains(entity) {
        return (
            entity.x >= this.bounds.x &&
            entity.x < this.bounds.x + this.bounds.width &&
            entity.y >= this.bounds.y &&
            entity.y < this.bounds.y + this.bounds.height
        );
    }

    /**
     * Query for entities within a rectangular area
     * @param {Object} range - { x, y, width, height }
     * @returns {Array} - Array of entities in range
     */
    query(range, found = []) {
        // Check if range intersects with this node's bounds
        if (!this.intersects(range)) {
            return found;
        }

        // Add entities from this node that are within range
        this.entities.forEach(entity => {
            if (this.pointInRange(entity, range)) {
                found.push(entity);
            }
        });

        // Recursively query children if divided
        if (this.divided) {
            this.northeast.query(range, found);
            this.northwest.query(range, found);
            this.southeast.query(range, found);
            this.southwest.query(range, found);
        }

        return found;
    }

    /**
     * Query for entities within a circular area (for AI vision/danger radius)
     * @param {number} centerX - Center X coordinate
     * @param {number} centerY - Center Y coordinate
     * @param {number} radius - Search radius
     * @param {string} entityType - Optional: filter by entity type ('player', 'enemy', 'pickup')
     * @returns {Array} - Array of entities within radius
     */
    queryCircle(centerX, centerY, radius, entityType = null) {
        // Create bounding box for the circle
        const range = {
            x: centerX - radius,
            y: centerY - radius,
            width: radius * 2,
            height: radius * 2
        };

        // Get entities in bounding box
        const candidates = this.query(range);

        // Filter to only those actually within circle and matching type (if specified)
        return candidates.filter(entity => {
            // Check entity type if filtering is requested
            if (entityType && entity._spatialType !== entityType) {
                return false;
            }

            // Check if within circular radius
            const dx = entity.x - centerX;
            const dy = entity.y - centerY;
            const distSq = dx * dx + dy * dy;
            return distSq <= radius * radius;
        });
    }

    /**
     * Check if range intersects with this node's bounds
     */
    intersects(range) {
        return !(
            range.x > this.bounds.x + this.bounds.width ||
            range.x + range.width < this.bounds.x ||
            range.y > this.bounds.y + this.bounds.height ||
            range.y + range.height < this.bounds.y
        );
    }

    /**
     * Check if a point is within a range
     */
    pointInRange(point, range) {
        return (
            point.x >= range.x &&
            point.x < range.x + range.width &&
            point.y >= range.y &&
            point.y < range.y + range.height
        );
    }

    /**
     * Clear all entities from the tree
     */
    clear() {
        this.entities = [];
        this.divided = false;
        this.northeast = null;
        this.northwest = null;
        this.southeast = null;
        this.southwest = null;
    }

    /**
     * Get total number of entities in the tree
     */
    size() {
        let count = this.entities.length;

        if (this.divided) {
            count += this.northeast.size();
            count += this.northwest.size();
            count += this.southeast.size();
            count += this.southwest.size();
        }

        return count;
    }

    /**
     * Debug: Draw the quadtree boundaries (for visualization)
     */
    draw(graphics, color = 0x00ff00, alpha = 0.3) {
        graphics.lineStyle(1, color, alpha);
        graphics.strokeRect(
            this.bounds.x,
            this.bounds.y,
            this.bounds.width,
            this.bounds.height
        );

        if (this.divided) {
            this.northeast.draw(graphics, color, alpha);
            this.northwest.draw(graphics, color, alpha);
            this.southeast.draw(graphics, color, alpha);
            this.southwest.draw(graphics, color, alpha);
        }
    }
}
