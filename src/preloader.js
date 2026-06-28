// Loads the procedurally-generated player spritesheet and registers walk/idle
// animations for every facing direction. Everything else in-game is still
// drawn procedurally at scene creation time. To regenerate the sheet after
// editing scripts/gen-player-sprite.js, run `npm run gen:sprite`.
export class Preloader extends Phaser.Scene {
    constructor() {
        super({ key: "Preloader" });
    }

    preload() {
        this.load.spritesheet('player', 'assets/player-sheet.png', {
            frameWidth: 32,
            frameHeight: 32,
        });
    }

    create() {
        this.registerPlayerAnims();
        this.scene.start("CaveScene");
    }

    // Registered once globally on the anims manager; survives MP scene restarts.
    // Frame layout: rows 0..3 = down/left/right/up, 4 frames per row.
    //   col 0: idle pose
    //   cols 1..3: walk cycle (step-A, passing, step-B)
    registerPlayerAnims() {
        const dirs = [
            { name: 'down',  baseFrame: 0 },
            { name: 'left',  baseFrame: 4 },
            { name: 'right', baseFrame: 8 },
            { name: 'up',    baseFrame: 12 },
        ];

        for (const { name, baseFrame } of dirs) {
            const idleKey = `player-idle-${name}`;
            if (!this.anims.exists(idleKey)) {
                this.anims.create({
                    key: idleKey,
                    frames: [{ key: 'player', frame: baseFrame }],
                    frameRate: 1,
                    repeat: -1,
                });
            }

            const walkKey = `player-walk-${name}`;
            if (!this.anims.exists(walkKey)) {
                // Step-A, passing, step-B, passing — yields a smooth 4-frame loop.
                this.anims.create({
                    key: walkKey,
                    frames: this.anims.generateFrameNumbers('player', {
                        frames: [baseFrame + 1, baseFrame + 2, baseFrame + 3, baseFrame + 2],
                    }),
                    frameRate: 8,
                    repeat: -1,
                });
            }
        }
    }
}
