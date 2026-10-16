// Prints generator statistics per difficulty, for the first levels and for
// the levels at the top of the difficulty ramp: node scripts/stats.js [levels]
import { generateLevel, levelParams, DIFFICULTIES, RAMP_LEVELS } from '../js/generator.js';

const count = Number(process.argv[2] || 20);
for (const key of Object.keys(DIFFICULTIES)) {
  for (const from of [1, RAMP_LEVELS]) {
    const rows = [];
    let ms = 0;
    for (let n = from; n < from + count; n++) {
      const t = performance.now();
      const level = generateLevel(key, n);
      ms += performance.now() - t;
      const filled = level.arrows.reduce((s, a) => s + a.cells.length, 0);
      const lens = level.arrows.map((a) => a.cells.length);
      rows.push({
        fill: filled / (level.cols * level.rows),
        arrows: level.arrows.length,
        avgLen: lens.reduce((a, b) => a + b, 0) / lens.length,
        ...level.stats,
      });
    }
    const avg = (k) => (rows.reduce((s, r) => s + r[k], 0) / rows.length).toFixed(2);
    const min = (k) => Math.min(...rows.map((r) => r[k])).toFixed(2);
    const { cols, rows: h } = levelParams(key, from);
    console.log(
      `${key.padEnd(7)} level ${String(from).padStart(2)}+ ${cols}x${h}  fill ${avg('fill')} (min ${min('fill')})  ` +
        `arrows ${avg('arrows')}  len ${avg('avgLen')}  firstFree ${avg('firstFree')}  avgFree ${avg('avgFree')}  ` +
        `rounds ${avg('rounds')}  solvable ${rows.every((r) => r.solvable)}  ${(ms / count).toFixed(0)}ms/level`,
    );
  }
}
