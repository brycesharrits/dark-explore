// Procedural pixel-art player spritesheet generator.
//
// Emits public/assets/player-sheet.png: a 128×128 PNG with 16 frames laid out
// as 4 rows × 4 columns of 32×32 cells. Rows are facing directions (down /
// left / right / up). Columns are walk-cycle frames (idle, step-A, passing,
// step-B). All art is drawn in greyscale + alpha so Phaser's setTint can
// colorize the sprite per-player at runtime.
//
// Run: node scripts/gen-player-sprite.js  (or `npm run gen:sprite`)
// Output is intended to be committed to the repo. Re-run only when the
// drawing code below changes.

import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TILE = 32;
const COLS = 4;
const ROWS = 4;
const W = TILE * COLS;
const H = TILE * ROWS;

const png = new PNG({ width: W, height: H });
// pngjs initializes png.data to zeros — fully transparent — so no explicit
// clear pass needed.

// Greyscale palette. Tint multiplies these by the player's color: white
// pixels become the full tint; darker pixels become darker shades of it.
const C = {
    OUTLINE: [40, 40, 40, 255],
    EYE:     [30, 30, 30, 255],
    HAIR:    [80, 80, 80, 255],
    HEAD:    [255, 255, 255, 255],
    TORSO:   [232, 232, 232, 255],
    ARM:     [216, 216, 216, 255],
    LEG:     [184, 184, 184, 255],
};

function px(x, y, c) {
    if (x < 0 || x >= W || y < 0 || y >= H) return;
    const i = (y * W + x) << 2;
    png.data[i] = c[0];
    png.data[i + 1] = c[1];
    png.data[i + 2] = c[2];
    png.data[i + 3] = c[3];
}

function rect(x, y, w, h, c) {
    for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
            px(x + dx, y + dy, c);
        }
    }
}

function fillEllipse(cx, cy, rx, ry, c) {
    for (let dy = -ry; dy <= ry; dy++) {
        for (let dx = -rx; dx <= rx; dx++) {
            if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1.0) {
                px(cx + dx, cy + dy, c);
            }
        }
    }
}

// Walk-cycle phase: returns vertical lift for each leg (A=left, B=right
// relative to the unflipped sprite). Negative = raised. Frames 0/2 are
// neutral; 1 = leg A up; 3 = leg B up. Arms in the drawers swing opposite
// to the same-side leg, which (with the cross-mapping armA←b, armB←a) lands
// the contralateral arm forward — the natural walking gait.
function legPhase(frame) {
    if (frame === 1) return { a: -2, b: 0 };
    if (frame === 3) return { a: 0, b: -2 };
    return { a: 0, b: 0 };
}

function drawDown(ox, oy, frame) {
    const { a, b } = legPhase(frame);
    fillEllipse(ox + 16, oy + 8, 5, 4, C.HEAD);
    px(ox + 14, oy + 8, C.EYE);
    px(ox + 18, oy + 8, C.EYE);
    rect(ox + 12, oy + 13, 9, 9, C.TORSO);
    rect(ox + 9,  oy + 14 + b, 3, 8, C.ARM);
    rect(ox + 20, oy + 14 + a, 3, 8, C.ARM);
    rect(ox + 12, oy + 22, 3, 8 + a, C.LEG);
    rect(ox + 17, oy + 22, 3, 8 + b, C.LEG);
}

function drawUp(ox, oy, frame) {
    const { a, b } = legPhase(frame);
    // Back of head — darker shade, no face.
    fillEllipse(ox + 16, oy + 8, 5, 4, C.HAIR);
    rect(ox + 12, oy + 13, 9, 9, C.TORSO);
    rect(ox + 9,  oy + 14 + b, 3, 8, C.ARM);
    rect(ox + 20, oy + 14 + a, 3, 8, C.ARM);
    rect(ox + 12, oy + 22, 3, 8 + a, C.LEG);
    rect(ox + 17, oy + 22, 3, 8 + b, C.LEG);
}

// Side profile. `facingRight=true` draws the character looking right;
// `facingRight=false` mirrors horizontally for left-facing.
function drawSide(ox, oy, frame, facingRight) {
    const { a, b } = legPhase(frame);
    // Mirror helper: given an x in [0, 32) within the frame, returns the
    // mirrored x for left-facing.
    const mx = (x) => facingRight ? x : (TILE - 1 - x);

    // Head
    fillEllipse(ox + mx(16), oy + 8, 5, 4, C.HEAD);
    // Hair detail on the back of the head for orientation
    for (let dx = -5; dx <= -2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
            const inside = (dx * dx) / 25 + (dy * dy) / 16 <= 1.0;
            if (inside) px(ox + mx(16 + dx), oy + 8 + dy, C.HAIR);
        }
    }
    // Single eye on the facing side
    px(ox + mx(18), oy + 8, C.EYE);

    // Torso — narrower than front view (depth)
    rect(ox + mx(13) - (facingRight ? 0 : 6), oy + 13, 7, 9, C.TORSO);

    // Two arms with front-back swing (X offset based on phase).
    // Front arm (visible side) swings forward when same-side leg is back.
    const frontArmOffset = -b;  // forward when leg B is planted/back
    const backArmOffset  = -a;
    // For left-facing, "forward" flips sign.
    const dir = facingRight ? 1 : -1;
    rect(ox + mx(19) + dir * frontArmOffset, oy + 14, 2, 8, C.ARM);
    rect(ox + mx(12) + dir * backArmOffset,  oy + 14, 2, 8, C.ARM);

    // Legs — both visible, slight x-offset and lift creates step illusion
    rect(ox + mx(13), oy + 22, 3, 8 + a, C.LEG);
    rect(ox + mx(17), oy + 22, 3, 8 + b, C.LEG);
}

// Row order matches the animation keys registered in Preloader:
//   row 0: down, row 1: left, row 2: right, row 3: up
for (let f = 0; f < COLS; f++) drawDown(f * TILE, 0 * TILE, f);
for (let f = 0; f < COLS; f++) drawSide(f * TILE, 1 * TILE, f, false);
for (let f = 0; f < COLS; f++) drawSide(f * TILE, 2 * TILE, f, true);
for (let f = 0; f < COLS; f++) drawUp(f * TILE, 3 * TILE, f);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outPath = path.resolve(__dirname, '..', 'public', 'assets', 'player-sheet.png');

png.pack().pipe(fs.createWriteStream(outPath))
    .on('finish', () => console.log(`Wrote ${outPath} (${W}×${H}, ${ROWS} rows × ${COLS} frames)`))
    .on('error', (err) => { console.error(err); process.exit(1); });
