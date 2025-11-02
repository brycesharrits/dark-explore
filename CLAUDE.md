# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Phaser's Revenge is a Space Invaders-style arcade game built with Phaser 3 and Vite. The player shoots at an enemy ship while dodging its attacks to score points within a time limit.

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start development server (runs Vite dev server)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Architecture

### Tech Stack
- **Phaser 3.80.1** - Game framework providing physics, rendering, and scene management
- **Vite 5** - Build tool and dev server
- **ES6 modules** - Modern JavaScript module system

### Scene Flow
The game uses Phaser's scene system with parallel scene execution:

1. **Preloader** (`src/preloader.js`) - Loads all assets (sprites, atlases, animations, fonts)
2. **SplashScene** (`src/scenes/SplashScene.js`) - Initial splash screen
3. **MainScene** (`src/scenes/MainScene.js`) - Core gameplay scene, remains active throughout
4. **MenuScene** (`src/scenes/MenuScene.js`) - Menu overlay, launched in parallel with MainScene
5. **HudScene** (`src/scenes/HudScene.js`) - UI overlay for score/timer, launched when game starts
6. **GameOverScene** (`src/scenes/GameOverScene.js`) - End game screen with final score

### Scene Communication Pattern
The game uses a global event bus pattern via `this.game.events`:
- MenuScene emits `"start-game"` event when player clicks to start
- MainScene listens for `"start-game"` to begin gameplay
- MainScene directly accesses HudScene via `this.scene.get("HudScene")` to update score/timer
- Event listeners must be removed before transitioning to avoid duplicates (see MainScene:80)

### Game Object Architecture

**Player** (`src/gameobjects/Player.js`)
- Extends `Physics.Arcade.Image`
- States: `"waiting"` → `"start"` → `"can_move"`
- Manages its own bullet pool using Phaser's group system
- Propulsion fire sprite follows player position
- Entry animation uses tweens with trail effects

**BlueEnemy** (`src/gameobjects/BlueEnemy.js`)
- Extends `Physics.Arcade.Sprite`
- Manages its own bullet pool for enemy fire
- Has damage/scale progression system (3 life points per scale level, 4 scale levels)
- Uses sinusoidal tween for vertical movement that accelerates as enemy takes damage
- Fires back at player when hit

**Bullet** (`src/gameobjects/Bullet.js`)
- Extends `GameObjects.Image`
- Pooled instances (maxSize: 100) for performance
- Supports directional firing toward target coordinates
- Auto-destroys when off-screen or on hit with particle effects

### Physics System
- Arcade physics with zero gravity (`gravity: { y: 0 }`)
- Collision detection using `physics.add.overlap()` for bullets vs entities
- Object pooling pattern for bullets to avoid constant instantiation

### Asset Loading
Assets organized in `/public/assets/`:
- Texture atlases for animated sprites (enemy-blue, propulsion-fire)
- Separate animation JSON files loaded via `load.animation()`
- Bitmap fonts: pixelfont (XML-based) and knighthawks (RetroFont parsed at runtime)

### Game Configuration
- Canvas: 960x540 with FIT scaling and CENTER_BOTH
- Pixel art mode enabled
- Scene order in `src/main.js` determines load sequence



### Where We Are Going - Important!
- Everyting above this point was created by the claude init command. When I did the init command this game was the example template game, Phasers Revenge.
- So what I am saying is, all the code that is there now is the legacy code and we will be creating a completely new game that is entirely different. We will delete most of the old code eventually.
- The game we are creating will be a 2D tile scroller game where the player is in a dark cave, with very limited visibility. The visibility is created by the players lantern, which has limited oil. Over time the visibility will reduce, as the oil is depleting.  The visible area will be a small circle surrounding the player. The player can traverse up/down/left/right and search the level for lantern oil to make the visible area larger again. If the character runs out of oil, game over. The camera will follow the character, so the character will always be in the center of the screen. The players objective is to reach the cave exit. There will eventually be multiple levels/caves to explore.