// Thin pass-through to CaveScene. All in-game art is generated procedurally
// (see CaveEnemy / OilPickupManager / PowerUpManager), so there are no assets
// to preload at the moment.
export class Preloader extends Phaser.Scene {
    constructor() {
        super({ key: "Preloader" });
    }

    create() {
        this.scene.start("CaveScene");
    }
}
