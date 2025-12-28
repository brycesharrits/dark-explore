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

        // Reference to the cave scene
        this.caveScene = this.scene.get('CaveScene');
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
            } else if (oilPercent > 25) {
                this.oilBar.setFillStyle(0xff6600); // Dark orange
            } else {
                this.oilBar.setFillStyle(0xff0000); // Red
            }
        }

        // Update score display
        if (this.caveScene && this.caveScene.getScore) {
            const score = this.caveScene.getScore();
            this.scoreText.setText(`Score: ${score}`);
        }
    }
}
