// Prints generator statistics per difficulty: node scripts/stats.js [levels]
import { generateLevel, DIFFICULTIES } from '../js/generator.js';

const count = Number(process.argv[2] || 20);
for (const key of Object.keys(DIFFICULTIES)) {
  const rows = [];
  let ms = 0;
  for (let n = 1; n <= count; n++) {
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
  console.log(
    `${key.padEnd(7)} fill ${avg('fill')} (min ${min('fill')})  arrows ${avg('arrows')}  len ${avg('avgLen')}  ` +
      `firstFree ${avg('firstFree')}  avgFree ${avg('avgFree')}  rounds ${avg('rounds')}  ` +
      `solvable ${rows.every((r) => r.solvable)}  ${(ms / count).toFixed(0)}ms/level`,
  );
}
