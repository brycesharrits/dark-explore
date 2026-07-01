// Procedural pixel-art player spritesheet generator.
//
// Emits public/assets/player-sheet.png: a 192×192 PNG with 16 frames laid out
// as 4 rows × 4 columns of 48×48 cells. Rows are facing directions (down /
// left / right / up). Columns are walk-cycle frames (idle, step-A, passing,
// step-B).
//
// Character: a mysterious hooded silhouette wrapped tight in a grey cloak
// (blanket-wrap fit — narrow, body-shaped). The face is a deep void inside
// the hood; the only thing reaching outside the cloak is a single bare arm
// holding a warm oil lamp.
//
// Run: node scripts/gen-player-sprite.js  (or `npm run gen:sprite`)

import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TILE = 48;
const COLS = 4;
const ROWS = 4;
const W = TILE * COLS;
const H = TILE * ROWS;

const png = new PNG({ width: W, height: H });

const C = {
    HOOD:        [105, 105, 105, 255],
    HOOD_DARK:   [55, 55, 55, 255],
    HOOD_VOID:   [16, 16, 20, 255],
    CLOAK:       [140, 140, 140, 255],
    CLOAK_FOLD:  [108, 108, 108, 255],
    CLOAK_EDGE:  [65, 65, 65, 255],
    ARM:         [195, 195, 195, 255],
    LAMP_FRAME:  [205, 205, 205, 255],
    LAMP_DARK:   [90, 90, 90, 255],
    LAMP_GLOW:   [255, 220, 130, 255],
    LAMP_FLAME:  [255, 240, 175, 255],
    LAMP_CORE:   [255, 255, 230, 255],
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

// 7w × 10h oil lamp (plus a 2px bail above). (lx, ly) is the top-left of the
// cap row. Warm three-step gradient inside the glass.
function drawLamp(lx, ly) {
    // Bail (wire arc up to the hand)
    rect(lx + 2, ly - 2, 3, 1, C.LAMP_FRAME);
    px(lx + 1, ly - 1, C.LAMP_FRAME);
    px(lx + 5, ly - 1, C.LAMP_FRAME);

    // Peaked cap
    rect(lx + 2, ly, 3, 1, C.LAMP_FRAME);
    rect(lx + 1, ly + 1, 5, 1, C.LAMP_FRAME);
    rect(lx, ly + 2, 7, 1, C.LAMP_FRAME);

    // Glass housing (rows 3..7) — gradient from outer glow to hot core
    for (let dy = 3; dy <= 7; dy++) {
        px(lx, ly + dy, C.LAMP_DARK);
        px(lx + 6, ly + dy, C.LAMP_DARK);
        px(lx + 1, ly + dy, C.LAMP_GLOW);
        px(lx + 5, ly + dy, C.LAMP_GLOW);
        px(lx + 2, ly + dy, C.LAMP_FLAME);
        px(lx + 4, ly + dy, C.LAMP_FLAME);
        px(lx + 3, ly + dy, C.LAMP_CORE);
    }

    // Base
    rect(lx, ly + 8, 7, 1, C.LAMP_FRAME);
    rect(lx + 1, ly + 9, 5, 1, C.LAMP_DARK);
}

// Narrow body-shaped cloak. halfStart controls shoulder width; slope controls
// how much it flares to the hem (kept tiny for a wrapped-blanket look).
function drawCloakBody(ox, oy, centerX, halfStart, slope) {
    const dyTop = 18;
    const dyCount = 29; // 18..46
    for (let dy = 0; dy < dyCount; dy++) {
        const halfW = halfStart + Math.floor(dy * slope);
        rect(ox + centerX - halfW, oy + dyTop + dy, halfW * 2 + 1, 1, C.CLOAK);
    }
    // Center fold — the seam where the cloak is held closed
    for (let dy = 3; dy < dyCount - 2; dy += 3) {
        px(ox + centerX, oy + dyTop + dy, C.CLOAK_FOLD);
    }
    // Hem accent
    const lastHalf = halfStart + Math.floor((dyCount - 1) * slope);
    rect(ox + centerX - lastHalf, oy + dyTop + dyCount - 1, lastHalf * 2 + 1, 1, C.CLOAK_EDGE);
}

function bodyBob(frame) {
    if (frame === 1) return -1;
    if (frame === 3) return 1;
    return 0;
}
function armBob(frame) {
    if (frame === 1) return -1;
    if (frame === 3) return 1;
    return 0;
}

function drawDown(ox, oy, frame) {
    const bob = bodyBob(frame);
    const ab = armBob(frame);

    // Hood — slightly wider than the body so it drapes over the shoulders
    fillEllipse(ox + 24, oy + 10 + bob, 8, 7, C.HOOD);
    // Crown shadow
    fillEllipse(ox + 24, oy + 7 + bob, 6, 4, C.HOOD_DARK);
    // Deep void where the face would be
    fillEllipse(ox + 24, oy + 12 + bob, 4, 4, C.HOOD_VOID);
    // Hood front lip
    rect(ox + 21, oy + 9 + bob, 7, 1, C.HOOD_DARK);

    // Narrow shoulder line — blends hood into the wrapped cloak
    rect(ox + 18, oy + 17 + bob, 13, 1, C.HOOD);

    // Cloak wraps tight around the body, just a slight flare to the hem
    drawCloakBody(ox, oy, 24, 6, 0.04);

    // One arm reaches out from the cloak's left side. Sleeve overlaps the
    // cloak by a pixel for a clean join; the rest is bare arm + lamp.
    rect(ox + 14, oy + 23 + ab, 5, 4, C.CLOAK);   // cloaked upper arm
    rect(ox + 10, oy + 25 + ab, 5, 4, C.ARM);     // bare forearm + hand
    drawLamp(ox + 8, oy + 30 + ab);
}

function drawUp(ox, oy, frame) {
    const bob = bodyBob(frame);
    const ab = armBob(frame);

    // Hood from the back — fuller, no face cutout
    fillEllipse(ox + 24, oy + 11 + bob, 8, 8, C.HOOD);
    fillEllipse(ox + 24, oy + 8 + bob, 6, 4, C.HOOD_DARK);
    // Crown seam
    rect(ox + 23, oy + 4 + bob, 3, 1, C.HOOD_DARK);
    px(ox + 24, oy + 3 + bob, C.HOOD_DARK);

    // Shoulders
    rect(ox + 18, oy + 17 + bob, 13, 1, C.HOOD);

    // Cloak
    drawCloakBody(ox, oy, 24, 6, 0.04);

    // Same arm visible from behind
    rect(ox + 14, oy + 23 + ab, 5, 4, C.CLOAK);
    rect(ox + 10, oy + 25 + ab, 5, 4, C.ARM);
    drawLamp(ox + 8, oy + 30 + ab);
}

function drawSide(ox, oy, frame, facingRight) {
    const bob = bodyBob(frame);
    const ab = armBob(frame);
    // Mirror a left edge coordinate for a rect of given width.
    const mLeft = (leftX, width) => facingRight ? leftX : (TILE - leftX - width);

    // Hood profile
    fillEllipse(ox + (facingRight ? 24 : (TILE - 1 - 24)), oy + 10 + bob, 7, 7, C.HOOD);
    fillEllipse(ox + (facingRight ? 23 : (TILE - 1 - 23)), oy + 7 + bob, 5, 4, C.HOOD_DARK);
    // Deep void inside the hood (slightly forward of center)
    fillEllipse(ox + (facingRight ? 25 : (TILE - 1 - 25)), oy + 12 + bob, 3, 4, C.HOOD_VOID);
    // Front hood lip
    rect(ox + mLeft(27, 2), oy + 10 + bob, 2, 2, C.HOOD_DARK);

    // Shoulders (narrower in side profile)
    rect(ox + mLeft(20, 9), oy + 17 + bob, 9, 1, C.HOOD);

    // Cloak wraps the body — narrower than the front view
    const bodyCx = facingRight ? 24 : (TILE - 1 - 24);
    const dyTop = 18;
    const dyCount = 29;
    for (let dy = 0; dy < dyCount; dy++) {
        const halfW = 4 + Math.floor(dy * 0.03); // 4..4 (essentially vertical)
        rect(ox + bodyCx - halfW, oy + dyTop + dy, halfW * 2 + 1, 1, C.CLOAK);
    }
    // Center fold down the visible side
    for (let dy = 3; dy < dyCount - 2; dy += 4) {
        px(ox + bodyCx, oy + dyTop + dy, C.CLOAK_FOLD);
    }
    // Hem
    const lastHalf = 4 + Math.floor((dyCount - 1) * 0.03);
    rect(ox + bodyCx - lastHalf, oy + dyTop + dyCount - 1, lastHalf * 2 + 1, 1, C.CLOAK_EDGE);

    // Single front arm extending forward, lamp held out ahead
    rect(ox + mLeft(28, 4), oy + 23 + ab, 4, 4, C.CLOAK);   // cloaked upper arm
    rect(ox + mLeft(31, 4), oy + 25 + ab, 4, 4, C.ARM);     // bare forearm + hand
    drawLamp(ox + mLeft(33, 7), oy + 30 + ab);
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
