import { Scene } from 'phaser';

export class CaveHudScene extends Scene {
    constructor() {
        super({ key: 'CaveHudScene' });
    }

    create() {
        // Create oil indicator background
        const padding = 20;
        const barWidth = 200;
        const barHeight = 30;

        // Background rectangle
        this.oilBarBg = this.add.rectangle(
            padding,
            padding,
            barWidth,
            barHeight,
            0x333333
        );
        this.oilBarBg.setOrigin(0, 0);
        this.oilBarBg.setScrollFactor(0);

        // Oil bar (filled portion)
        this.oilBar = this.add.rectangle(
            padding + 2,
            padding + 2,
            barWidth - 4,
            barHeight - 4,
            0xffaa00
        );
        this.oilBar.setOrigin(0, 0);
        this.oilBar.setScrollFactor(0);

        // Oil text label
        this.oilText = this.add.text(
            padding + barWidth / 2,
            padding + barHeight / 2,
            'Oil: 100%',
            {
                fontSize: '16px',
                color: '#ffffff',
                fontStyle: 'bold'
            }
        );
        this.oilText.setOrigin(0.5);
        this.oilText.setScrollFactor(0);

        // Border for the bar
        this.oilBarBorder = this.add.rectangle(
            padding,
            padding,
            barWidth,
            barHeight
        );
        this.oilBarBorder.setOrigin(0, 0);
        this.oilBarBorder.setScrollFactor(0);
        this.oilBarBorder.setStrokeStyle(2, 0x000000);
        this.oilBarBorder.setFillStyle(0x000000, 0); // Transparent fill

        // Score text label (positioned below oil bar)
        this.scoreText = this.add.text(
            padding,
            padding + barHeight + 10,
            'Score: 0',
            {
                fontSize: '20px',
                color: '#ffffff',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 3
            }
        );
        this.scoreText.setOrigin(0, 0);
        this.scoreText.setScrollFactor(0);

        // Players alive text (Phase 6 - positioned below score)
        this.playersAliveText = this.add.text(
            padding,
            padding + barHeight + 40,
            'Players Alive: 100/100',
            {
                fontSize: '16px',
                color: '#00ff00',
                fontStyle: 'bold',
                stroke: '#000000',
                strokeThickness: 2
            }
        );
        this.playersAliveText.setOrigin(0, 0);
        this.playersAliveText.setScrollFactor(0);

        // Reference to the cave scene
        this.caveScene = this.scene.get('CaveScene');

        // Global effect indicators - positioned in top-left
        this.timeWarpIcon = null;
        this.timeWarpTimer = null;
        this.timeWarpTimerEvent = null; // Store timer event reference
        this.fullVisionIcon = null;
        this.fullVisionTimer = null;
        this.fullVisionTimerEvent = null; // Store timer event reference

        // Oil bar pulse animation (when critical/red)
        this.oilBarPulseTween = null;
    }

    update() {
        if (this.caveScene && this.caveScene.getOilPercentage) {
            // Get oil percentage from cave scene
            const oilPercent = this.caveScene.getOilPercentage();

            // Update oil bar width
            const barWidth = 196; // 200 - 4 for padding
            const currentWidth = (barWidth * oilPercent) / 100;
            this.oilBar.width = currentWidth;

            // Update oil text
            this.oilText.setText(`Oil: ${Math.ceil(oilPercent)}%`);

            // Change color based on oil level
            if (oilPercent > 50) {
                this.oilBar.setFillStyle(0xffaa00); // Orange
                this.stopOilBarPulse(); // Stop pulse if it was active
            } else if (oilPercent > 25) {
                this.oilBar.setFillStyle(0xff6600); // Dark orange
                this.stopOilBarPulse(); // Stop pulse if it was active
            } else {
                this.oilBar.setFillStyle(0xff0000); // Red
                this.startOilBarPulse(); // Start pulse animation when critical
            }
        }

        // Update score display
        if (this.caveScene && this.caveScene.getScore) {
            const score = this.caveScene.getScore();
            this.scoreText.setText(`Score: ${score}`);
        }

        // Update players alive display (Phase 6)
        if (this.caveScene && this.caveScene.eliminationTracker) {
            const tracker = this.caveScene.eliminationTracker;
            const playersAlive = tracker.getAlivePlayers();
            const totalPlayers = tracker.totalPlayers || 100;
            this.playersAliveText.setText(`Players Alive: ${playersAlive}/${totalPlayers}`);

            // Change color based on how many players are left
            if (playersAlive <= 10) {
                this.playersAliveText.setColor('#ff0000'); // Red when few players left
            } else if (playersAlive <= 25) {
                this.playersAliveText.setColor('#ffaa00'); // Orange
            } else {
                this.playersAliveText.setColor('#00ff00'); // Green
            }
        }
    }

    /**
     * Show time warp effect indicator
     * @param {number} duration - Duration in milliseconds
     */
    showTimeWarpEffect(duration) {
        console.log(`[CaveHudScene] showTimeWarpEffect called with duration: ${duration}ms`);

        // Clean up any existing time warp indicator first
        this.hideTimeWarpEffect();

        // Create time warp icon (positioned top-left, under players alive text)
        const iconSize = 32;
        const padding = 20;
        const x = padding + iconSize / 2; // Left side with padding
        const y = 120; // Below players alive text (~90 + 20 + 10)

        // Create graphics for icon
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Blue circle background
        graphics.fillStyle(0x0088ff, 0.9);
        graphics.fillCircle(iconSize / 2, iconSize / 2, iconSize / 2 - 2);
        graphics.lineStyle(2, 0x0044aa, 1);
        graphics.strokeCircle(iconSize / 2, iconSize / 2, iconSize / 2 - 2);

        // White clock icon
        graphics.fillStyle(0xffffff, 1);
        graphics.lineStyle(2, 0xffffff, 1);
        graphics.strokeCircle(iconSize / 2, iconSize / 2, 8); // Clock face

        // Clock hands
        graphics.beginPath();
        graphics.moveTo(iconSize / 2, iconSize / 2);
        graphics.lineTo(iconSize / 2, iconSize / 2 - 6); // Hour hand (up)
        graphics.stroke();

        graphics.beginPath();
        graphics.moveTo(iconSize / 2, iconSize / 2);
        graphics.lineTo(iconSize / 2 + 6, iconSize / 2); // Minute hand (right)
        graphics.stroke();

        // Generate texture with unique name to avoid collisions
        const textureName = `timewarp-hud-icon-${Date.now()}`;
        graphics.generateTexture(textureName, iconSize, iconSize);
        graphics.destroy();

        // Create sprite
        this.timeWarpIcon = this.add.image(x, y, textureName);
        this.timeWarpIcon.setOrigin(0.5, 0);
        this.timeWarpIcon.setScrollFactor(0);
        this.timeWarpIcon.setDepth(95); // Above most UI

        // Pulse animation
        this.tweens.add({
            targets: this.timeWarpIcon,
            scale: { from: 1, to: 1.2 },
            alpha: { from: 1, to: 0.7 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Timer text showing remaining duration
        this.timeWarpTimer = this.add.text(
            x,
            y + iconSize / 2 + 5,
            `${Math.ceil(duration / 1000)}s`,
            {
                fontSize: '12px',
                color: '#ffffff',
                fontStyle: 'bold',
                backgroundColor: '#00000088',
                padding: { x: 4, y: 2 }
            }
        );
        this.timeWarpTimer.setOrigin(0.5, 0);
        this.timeWarpTimer.setScrollFactor(0);
        this.timeWarpTimer.setDepth(95);

        // Update timer countdown
        const startTime = Date.now();
        this.timeWarpTimerEvent = this.time.addEvent({
            delay: 100, // Update every 100ms
            callback: () => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, duration - elapsed);
                const seconds = Math.ceil(remaining / 1000);

                if (this.timeWarpTimer && this.timeWarpTimer.active) {
                    this.timeWarpTimer.setText(`${seconds}s`);
                }

                if (remaining <= 0 && this.timeWarpTimerEvent) {
                    this.timeWarpTimerEvent.remove();
                    this.timeWarpTimerEvent = null;
                }
            },
            loop: true
        });

        console.log('[CaveHudScene] Time warp effect indicator shown');
    }

    /**
     * Hide time warp effect indicator
     */
    hideTimeWarpEffect() {
        // Stop the timer event first
        if (this.timeWarpTimerEvent) {
            this.timeWarpTimerEvent.remove();
            this.timeWarpTimerEvent = null;
        }

        if (this.timeWarpIcon || this.timeWarpTimer) {
            // Fade out animation
            const targets = [];
            if (this.timeWarpIcon) targets.push(this.timeWarpIcon);
            if (this.timeWarpTimer) targets.push(this.timeWarpTimer);

            if (targets.length > 0) {
                this.tweens.add({
                    targets: targets,
                    alpha: 0,
                    duration: 300,
                    ease: 'Linear',
                    onComplete: () => {
                        if (this.timeWarpIcon) {
                            this.timeWarpIcon.destroy();
                            this.timeWarpIcon = null;
                        }
                        if (this.timeWarpTimer) {
                            this.timeWarpTimer.destroy();
                            this.timeWarpTimer = null;
                        }
                    }
                });
            }

            console.log('[CaveHudScene] Time warp effect indicator hidden');
        }
    }

    /**
     * Show full vision effect indicator
     * @param {number} duration - Duration in milliseconds
     */
    showFullVisionEffect(duration) {
        console.log(`[CaveHudScene] showFullVisionEffect called with duration: ${duration}ms`);

        // Clean up any existing full vision indicator first
        this.hideFullVisionEffect();

        // Create full vision icon (positioned below time warp icon)
        const iconSize = 32;
        const padding = 20;
        const x = padding + iconSize / 2; // Left side with padding
        const y = 160; // Below time warp icon (120 + 32 + 8)

        // Create graphics for icon
        const graphics = this.make.graphics({ x: 0, y: 0, add: false });

        // Blue circle background
        graphics.fillStyle(0x0088ff, 0.9);
        graphics.fillCircle(iconSize / 2, iconSize / 2, iconSize / 2 - 2);
        graphics.lineStyle(2, 0x0044aa, 1);
        graphics.strokeCircle(iconSize / 2, iconSize / 2, iconSize / 2 - 2);

        // White eye icon
        graphics.fillStyle(0xffffff, 1);

        // Eye outline (ellipse)
        graphics.fillEllipse(iconSize / 2, iconSize / 2, 14, 8);

        // Pupil (dark circle)
        graphics.fillStyle(0x0088ff, 1);
        graphics.fillCircle(iconSize / 2, iconSize / 2, 4);

        // Highlight (small white dot)
        graphics.fillStyle(0xffffff, 1);
        graphics.fillCircle(iconSize / 2 + 1, iconSize / 2 - 1, 1.5);

        // Generate texture with unique name to avoid collisions
        const textureName = `fullvision-hud-icon-${Date.now()}`;
        graphics.generateTexture(textureName, iconSize, iconSize);
        graphics.destroy();

        // Create sprite
        this.fullVisionIcon = this.add.image(x, y, textureName);
        this.fullVisionIcon.setOrigin(0.5, 0);
        this.fullVisionIcon.setScrollFactor(0);
        this.fullVisionIcon.setDepth(95); // Above most UI

        // Pulse animation
        this.tweens.add({
            targets: this.fullVisionIcon,
            scale: { from: 1, to: 1.2 },
            alpha: { from: 1, to: 0.7 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Timer text showing remaining duration
        this.fullVisionTimer = this.add.text(
            x,
            y + iconSize / 2 + 5,
            `${Math.ceil(duration / 1000)}s`,
            {
                fontSize: '12px',
                color: '#ffffff',
                fontStyle: 'bold',
                backgroundColor: '#00000088',
                padding: { x: 4, y: 2 }
            }
        );
        this.fullVisionTimer.setOrigin(0.5, 0);
        this.fullVisionTimer.setScrollFactor(0);
        this.fullVisionTimer.setDepth(95);

        // Update timer countdown
        const startTime = Date.now();
        this.fullVisionTimerEvent = this.time.addEvent({
            delay: 100, // Update every 100ms
            callback: () => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, duration - elapsed);
                const seconds = Math.ceil(remaining / 1000);

                if (this.fullVisionTimer && this.fullVisionTimer.active) {
                    this.fullVisionTimer.setText(`${seconds}s`);
                }

                if (remaining <= 0 && this.fullVisionTimerEvent) {
                    this.fullVisionTimerEvent.remove();
                    this.fullVisionTimerEvent = null;
                }
            },
            loop: true
        });

        console.log('[CaveHudScene] Full vision effect indicator shown');
    }

    /**
     * Hide full vision effect indicator
     */
    hideFullVisionEffect() {
        // Stop the timer event first
        if (this.fullVisionTimerEvent) {
            this.fullVisionTimerEvent.remove();
            this.fullVisionTimerEvent = null;
        }

        if (this.fullVisionIcon || this.fullVisionTimer) {
            // Fade out animation
            const targets = [];
            if (this.fullVisionIcon) targets.push(this.fullVisionIcon);
            if (this.fullVisionTimer) targets.push(this.fullVisionTimer);

            if (targets.length > 0) {
                this.tweens.add({
                    targets: targets,
                    alpha: 0,
                    duration: 300,
                    ease: 'Linear',
                    onComplete: () => {
                        if (this.fullVisionIcon) {
                            this.fullVisionIcon.destroy();
                            this.fullVisionIcon = null;
                        }
                        if (this.fullVisionTimer) {
                            this.fullVisionTimer.destroy();
                            this.fullVisionTimer = null;
                        }
                    }
                });
            }

            console.log('[CaveHudScene] Full vision effect indicator hidden');
        }
    }

    /**
     * Start oil bar pulse animation when critical (< 25%)
     */
    startOilBarPulse() {
        // Don't start if already pulsing
        if (this.oilBarPulseTween) {
            return;
        }

        // Pulse animation - scale the entire oil bar container
        this.oilBarPulseTween = this.tweens.add({
            targets: [this.oilBarBg, this.oilBar, this.oilBarBorder, this.oilText],
            scaleX: { from: 1, to: 1.08 },
            scaleY: { from: 1, to: 1.15 },
            duration: 500,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    /**
     * Stop oil bar pulse animation
     */
    stopOilBarPulse() {
        if (this.oilBarPulseTween) {
            this.oilBarPulseTween.remove();
            this.oilBarPulseTween = null;

            // Reset scale to normal
            this.oilBarBg.setScale(1);
            this.oilBar.setScale(1);
            this.oilBarBorder.setScale(1);
            this.oilText.setScale(1);
        }
    }
}
