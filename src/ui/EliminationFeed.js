/**
 * EliminationFeed - Shows recent player eliminations in a kill feed
 * Phase 6: Visual feedback for eliminations
 */
export class EliminationFeed {
    constructor(scene) {
        this.scene = scene;
        this.feedItems = []; // Array of text objects
        this.maxItems = 6; // Maximum number of items to show
        this.fadeOutDuration = 500; // Fade out animation duration (ms) when pushed off
        this.itemLifetime = 3000; // Max time an item stays before auto-expiring (ms)

        // Feed positioning (top-right corner)
        this.x = scene.cameras.main.width - 10; // Right side with padding
        this.y = 10; // Top with padding
        this.lineHeight = 20; // Space between items (reduced from 24)

        console.log('[EliminationFeed] Initialized');
    }

    /**
     * Add an elimination to the feed
     * @param {string} playerName - Name of eliminated player
     * @param {string} reason - Reason for elimination
     * @param {number} rank - Final rank of the player
     */
    addElimination(playerName, reason, rank) {
        // Format the elimination message
        const reasonText = this.formatReason(reason);
        const message = `${playerName} ${reasonText} (#${rank})`;

        // Remove oldest item if we're at max capacity (push off the bottom)
        if (this.feedItems.length >= this.maxItems) {
            const oldestItem = this.feedItems[this.feedItems.length - 1];

            // Cancel its lifetime timer — we're removing it now.
            if (oldestItem.expireTimer) {
                oldestItem.expireTimer.remove(false);
                oldestItem.expireTimer = null;
            }

            // Fade out and destroy
            this.scene.tweens.add({
                targets: oldestItem.text,
                alpha: 0,
                duration: this.fadeOutDuration,
                ease: 'Linear',
                onComplete: () => {
                    oldestItem.text.destroy();
                }
            });

            this.feedItems.pop(); // Remove from end of array
        }

        // Create text object at the top position
        const textObj = this.scene.add.text(
            this.x,
            this.y,
            message,
            {
                fontSize: '12px', // Smaller font (was 14px)
                color: '#ff6666', // Light red
                fontStyle: 'normal',
                backgroundColor: '#00000066', // More transparent (was #000000aa)
                padding: { x: 5, y: 3 } // Slightly reduced padding
            }
        );
        textObj.setOrigin(1, 0); // Right-aligned
        textObj.setScrollFactor(0); // Fixed to camera
        textObj.setDepth(90); // Below HUD but above game
        textObj.setAlpha(0); // Start invisible
        textObj.setScale(0.9); // Start slightly smaller

        // Store item with metadata
        const feedItem = {
            text: textObj,
            createdAt: Date.now(),
            expireTimer: null
        };

        // Add to beginning of feed (top)
        this.feedItems.unshift(feedItem);

        // Auto-expire after itemLifetime unless pushed off by newer items first.
        feedItem.expireTimer = this.scene.time.delayedCall(this.itemLifetime, () => {
            feedItem.expireTimer = null;
            if (this.feedItems.includes(feedItem)) {
                this.removeItem(feedItem);
            }
        });

        // Fade in animation for new item
        this.scene.tweens.add({
            targets: textObj,
            alpha: 0.85,
            scale: 1,
            duration: 200,
            ease: 'Back.easeOut'
        });

        // Reposition all items (push everything down)
        this.repositionItems();

        console.log(`[EliminationFeed] Added: ${message}`);
    }

    /**
     * Format elimination reason for display
     */
    formatReason(reason) {
        const reasonMap = {
            'OUT_OF_OIL': 'ran out of oil',
            'OIL_DEPLETED': 'ran out of oil',
            'ENEMY_COLLISION': 'was eliminated'
        };
        return reasonMap[reason] || 'was eliminated';
    }

    /**
     * Remove a specific item from the feed
     * (Not actively used - items are removed when pushed off)
     */
    removeItem(feedItem) {
        if (feedItem.expireTimer) {
            feedItem.expireTimer.remove(false);
            feedItem.expireTimer = null;
        }
        // Fade out and destroy
        this.scene.tweens.add({
            targets: feedItem.text,
            alpha: 0,
            duration: this.fadeOutDuration,
            ease: 'Linear',
            onComplete: () => {
                feedItem.text.destroy();

                // Remove from array
                const index = this.feedItems.indexOf(feedItem);
                if (index > -1) {
                    this.feedItems.splice(index, 1);
                }

                // Reposition remaining items
                this.repositionItems();
            }
        });
    }

    /**
     * Remove the oldest item in the feed (last item in array)
     */
    removeOldestItem() {
        if (this.feedItems.length > 0) {
            this.removeItem(this.feedItems[this.feedItems.length - 1]);
        }
    }

    /**
     * Reposition all items (animate them smoothly)
     */
    repositionItems() {
        this.feedItems.forEach((item, index) => {
            const targetY = this.y + (index * this.lineHeight);

            // Animate to new position
            this.scene.tweens.add({
                targets: item.text,
                y: targetY,
                duration: 200,
                ease: 'Sine.easeOut'
            });
        });
    }

    /**
     * Clear all items from the feed
     */
    clear() {
        this.feedItems.forEach(item => {
            if (item.expireTimer) item.expireTimer.remove(false);
            item.text.destroy();
        });
        this.feedItems = [];
    }

    /**
     * Update feed (called each frame if needed)
     * Currently not needed but available for future enhancements
     */
    update() {
        // Future: Could add animations, flashing for important eliminations, etc.
    }
}
