# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dark Explore is a 2D top-down dark-cave game. The player carries a lantern with limited oil that defines a small circle of visibility around them; oil depletes over time and must be replenished by picking up oil cans scattered through the cave. Two play modes share the same world and managers:

- **Solo / sandbox** — open `/`. The client generates the world locally, spawns 99 bots (30% Smart, 70% Dumb), and runs everything client-side. Mostly used for testing.
- **Battle royale (multiplayer)** — open `/?mp=1`. The client connects to the Node/Socket.IO server; the server is authoritative for world layout, physics, and elimination, and fills each room to 10 players (humans + bots).

## Development Commands

- `npm install` — install client deps; also run `npm install` inside `server/` for the server
- `npm run dev` — Vite dev server for the client (solo mode at `/`)
- `npm run server` — start the multiplayer server (port 3001)
- `npm run server:dev` — server with `--watch` auto-reload
- `npm run dev:mp` — runs Vite + server concurrently, the standard "I want multiplayer" workflow
- `npm run build` / `npm run preview` — production build and local preview

The Vite dev server proxies `/socket.io` → `http://localhost:3001`, so the client can reach the MP server with `?mp=1` during development.

## Tech Stack

- **Phaser 3.80.1** — rendering, arcade physics, scene/event system, Light2D pipeline for lantern lighting
- **Vite 5** — client build + dev server with HMR
- **Node + Express + Socket.IO 4** — authoritative multiplayer server
- **seedrandom** — deterministic RNG so server and client can generate the same world from a shared seed
- **ES6 modules** throughout, including `"type": "module"` in `server/`

## Top-level layout

```
src/
  main.js                  — Phaser game config + socket bootstrap
  preloader.js             — pass-through scene (in-game art is procedural)
  scenes/
    CaveScene.js           — gameplay scene (world gen, lantern, MP listeners, win/lose)
    CaveHudScene.js        — HUD overlay (oil bar, alive count, elim feed root)
  gameobjects/
    BasePlayer.js          — shared player base (oil, score, eliminate())
    HumanPlayer.js         — keyboard-driven local player
    BotPlayer.js           — base for AI players
    SmartBot.js            — flees enemies, seeks oil intelligently
    DumbBot.js             — random wander + occasional oil seek
    RemotePlayer.js        — interpolated mirror of another human (MP only)
    CaveEnemy.js           — red wandering enemy; collides with walls, instant-kill on touch
  managers/
    PlayerManager.js       — spawns players, tracks alive set, dispatches updates
    OilPickupManager.js    — spawns/respawns oil pickups; spawnAtPositions for MP
    PowerUpManager.js      — speed / fullvision / timewarp pickups
    EliminationTracker.js  — ranks and winner detection
  ui/
    EliminationFeed.js     — scrolling kill-feed overlay
  network/
    SocketManager.js       — Socket.IO client wrapper (re-emits as 'net:*' events)
  utils/SpatialPartition.js — grid bucket for fast neighbor queries by bots
  config/DebugConfig.js    — debug visualization toggles

server/
  server.js                — Express + Socket.IO bootstrap
  config/ServerConfig.js   — single source of truth for tick rate, world size, counts, etc.
  rooms/RoomManager.js     — matchmaking; assigns sockets to GameRooms
  rooms/GameRoom.js        — per-room lifecycle (lobby → countdown → in-game → game-over)
  game/ServerGameState.js  — authoritative state: players, pickups, power-ups, enemies
  game/ServerPlayerState.js — per-player server state
  game/PhysicsResolver.js  — AABB-vs-tile-grid collision; world-bounds clamping
  game/WorldGenerator.js   — deterministic maze + spawn/pickup/power-up placement
```

## Scene flow

```
Preloader  →  CaveScene  +  CaveHudScene (parallel HUD overlay)
```

- `Preloader` does nothing but `scene.start("CaveScene")` — there are no assets to load because every in-game sprite is procedurally generated (`make.graphics().generateTexture(...)`).
- `CaveScene` owns gameplay. `CaveHudScene` is launched from `CaveScene.startGame()` and reads state via `this.scene.get("CaveScene")`.
- Mode (solo vs MP) is decided at boot: `main.js` reads `?mp=1`, constructs a single `SocketManager`, and stores both in `game.registry` so `CaveScene` can pick them up in `create()`.

## Game object architecture

`BasePlayer extends Physics.Arcade.Sprite` — owns the oil/score/elimination model. `eliminate(reason)` hides the sprite and disables the body but does NOT call `destroy()`, so listeners that need to clean up alive-state must subscribe to the scene's `'player-eliminated'` event (not the sprite's `'destroy'` event — see `PlayerManager` constructor).

- **HumanPlayer** — keyboard input; `applyServerState(x, y, oil, speed)` does soft-lerp / hard-snap reconciliation against server snapshots.
- **BotPlayer** → **SmartBot** / **DumbBot** — staggered AI updates (`PlayerManager.botsPerFrameUpdate`) to spread CPU cost across frames.
- **RemotePlayer** — buffered snapshot interpolation; `applyElimination()` is called by `PlayerManager.applySnapshot` when the server marks a remote dead.
- **CaveEnemy** — simple 8-direction wander; collides with the tile layer; rerolls direction immediately when `body.blocked.*` so it doesn't grind walls.

## World generation

Both `WorldGenerator.generate()` (server, MP) and `CaveScene.generateMaze()` (client, solo) follow the same algorithm so MP clients can render the same world deterministically:

1. Fill grid with walls.
2. Place random rooms (or use server-provided rooms in MP).
3. Connect room centers in a linear chain of L-shaped corridors.
4. Carve a 5×5 starting area at map center.
5. **Add a corridor from center to the nearest room** so the start area is guaranteed to be part of the connected graph.
6. Flood-fill from center to produce a reachability mask.
7. Pickups / power-ups / enemy spawns / bot spawns / player spawns all gate on `isFootprintReachable(x, y, radius)` — center + 4 corners must all land on reachable floor tiles. This prevents items from spawning inside walls or in unreachable pockets.

The server sends `rooms[]` to the client at `game_start`; both sides regenerate the same maze from those rooms.

## Lantern / lighting

- `lights.setAmbientColor(0x0a0a0a)` (near-black) + a single point light at the player.
- All gameplay sprites use `setPipeline('Light2D')` to be affected by the lantern.
- Light radius and intensity scale with `currentOil / maxOil`. Below `minRadiusBeforeDim` the light starts dimming and going reddish, telegraphing the oil-out elimination.
- `playLanternFlicker()` animates the light from 0 → full at `startGame()` with a synthetic spark sound via Web Audio API (no audio file).

## Multiplayer model

Authoritative server with client-side prediction-light reconciliation.

- **Tick rate**: 20 Hz (`SERVER_CONFIG.TICK_RATE`). Each tick: integrate inputs, resolve physics against `wallGrid`, deplete oil, check collisions, broadcast `world_snapshot`.
- **Client → server**: `player_input` with the current direction vector.
- **Server → client** (via `SocketManager`, re-emitted as `net:<event>`):
  - `room_joined`, `lobby_update`, `game_start` (includes rooms, spawn positions, pickups)
  - `world_snapshot` (per-tick: player states + dirty pickups)
  - `player_eliminated`, `pickup_collected`, `powerup_collected/expired`, `game_over`
- **Reconciliation**: `HumanPlayer.applyServerState` soft-lerps small drift (<64px) and hard-snaps anything larger. Remote players buffer snapshots and interpolate via `RemotePlayer.update(delta)`.

`SERVER_CONFIG` in `server/config/ServerConfig.js` is the single source of truth for shared constants. The client's matching values (oil depletion, speeds, counts) are intentionally hardcoded to match.

## Elimination flow

1. Anything that should kill a player calls `player.eliminate(reason)` (oil depleted, enemy collision, server `player_eliminated` event).
2. `BasePlayer.eliminate()` sets `state='DEAD'`, hides sprite, disables body, emits scene event `'player-eliminated'` (guarded against re-entry).
3. `PlayerManager` listens for that event and removes the player from `alivePlayers`.
4. `CaveScene.onPlayerEliminated` records it in `EliminationTracker` (which assigns the rank from `currentRank--`) and pushes a row into `EliminationFeed`.
5. If `eliminationTracker.hasWinner()` (1 player left), `handleVictory()` fires.

**Important:** scene event listeners must be `.off()`'d before re-registering and on `Phaser.Scenes.Events.SHUTDOWN`. Duplicate listeners cause double-counted eliminations and premature `hasWinner()` — see the cleanup pattern in `CaveScene.create()` and `PlayerManager.constructor`.

## Performance priorities

The user's stated preference (do not change without checking): **simplicity / lightweight / smooth / performant over high-quality graphics, images, animations, art.** Concretely:

- All sprites are procedurally generated with `Graphics.generateTexture` — no image assets.
- Bot updates are staggered across frames (`PlayerManager.botsPerFrameUpdate = 20`).
- `SpatialPartition` (`src/utils/`) is used for bots' nearest-pickup / nearest-enemy queries.
- The map is currently 80×80 tiles (`tileSize=32` → 2560×2560 px world). When changing it, also re-tune `numEnemies`, `numOilPickups`, `numPowerUps`, and the bot count to keep density playable.

## Game vision and direction

The game may eventually support multiple modes (solo levels with a cave exit, battle royale, etc.). The current focus is the multiplayer battle-royale mode. Things on the wish list include: minimap, much larger / more complex maps, player sprite animations, more polished MP. Keep performance in mind whenever expanding scope.
