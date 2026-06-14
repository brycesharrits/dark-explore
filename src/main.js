import { Game } from "phaser";
import { Preloader } from "./preloader";
import { CaveScene } from "./scenes/CaveScene";
import { CaveHudScene } from "./scenes/CaveHudScene";
import { SocketManager } from "./network/SocketManager";

// Detect multiplayer mode via ?mp=1 URL param
const isMultiplayer = new URLSearchParams(window.location.search).has('mp');

// Create SocketManager instance (shared across all scenes via game.registry)
const socketManager = new SocketManager();

if (isMultiplayer) {
    console.log('[main] Multiplayer mode enabled — connecting to server');
    socketManager.connect();
}

const config = {
    type: Phaser.AUTO,
    parent: "phaser-container",
    width: 960,
    height: 540,
    backgroundColor: "#1c172e",
    pixelArt: true,
    roundPixel: false,
    max: {
        width: 1000,
        height: 1000,
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: "arcade",
        arcade: {
            gravity: { y: 0 }
        }
    },
    callbacks: {
        postBoot: (game) => {
            game.registry.set('socketManager', socketManager);
            game.registry.set('isMultiplayer', isMultiplayer);
        }
    },
    scene: [
        Preloader,
        CaveScene,
        CaveHudScene
    ]
};

new Game(config);
