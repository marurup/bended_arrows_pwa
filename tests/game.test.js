import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board, analyse } from '../js/board.js';
import { DIFFICULTIES, RAMP_LEVELS, generateLevel, levelParams } from '../js/generator.js';

const level = (cols, rows, ...arrows) => ({ cols, rows, arrows: arrows.map((cells) => ({ cells })) });

test('an arrow with a clear line to the edge is free', () => {
  const b = new Board(
    level(4, 3, [
      [0, 1],
      [1, 1],
    ]),
  );
  assert.equal(b.blocker(0), null);
  assert.deepEqual(b.ray(0), [
    [2, 1],
    [3, 1],
  ]);
});

test('an arrow straight ahead blocks, and how far the head gets', () => {
  // Arrow 0 points right along row 1; arrow 1 stands upright in column 3.
  const b = new Board(
    level(
      5,
      3,
      [
        [0, 1],
        [1, 1],
      ],
      [
        [3, 0],
        [3, 1],
        [3, 2],
      ],
    ),
  );
  assert.deepEqual(b.blocker(0), { id: 1, steps: 2 });
  b.remove(1);
  assert.equal(b.blocker(0), null);
  assert.equal(b.remaining, 1);
});

test('only the line ahead of the head matters, not the body', () => {
  // A bent arrow: its body runs past another arrow, but the head points away.
  const b = new Board(
    level(
      4,
      4,
      [
        [0, 3],
        [1, 3],
        [1, 2],
        [1, 1],
        [1, 0],
      ],
      [
        [3, 3],
        [2, 3],
      ],
    ),
  );
  assert.equal(b.blocker(0), null, 'head points up and out');
  assert.deepEqual(b.blocker(1), { id: 0, steps: 1 }, 'second arrow points left into the first');
});

test('analyse spots a deadlock', () => {
  // Two arrows pointing at each other can never leave.
  const stuck = level(
    4,
    1,
    [
      [0, 0],
      [1, 0],
    ],
    [
      [3, 0],
      [2, 0],
    ],
  );
  assert.equal(analyse(stuck).solvable, false);
});

test('levels are deterministic per difficulty and number', () => {
  assert.deepEqual(generateLevel('medium', 7).arrows, generateLevel('medium', 7).arrows);
  assert.notDeepEqual(generateLevel('medium', 7).arrows, generateLevel('medium', 8).arrows);
});

for (const difficulty of Object.keys(DIFFICULTIES)) {
  test(`${difficulty}: generated levels are valid and solvable`, () => {
    for (let n = 1; n <= 25; n++) {
      const p = levelParams(difficulty, n);
      const lvl = generateLevel(difficulty, n);
      assert.equal(lvl.cols, p.cols);
      assert.equal(lvl.rows, p.rows);
      const seen = new Set();
      for (const { cells } of lvl.arrows) {
        assert.ok(cells.length >= 2, 'arrows span at least two dots');
        cells.forEach(([x, y], i) => {
          assert.ok(x >= 0 && y >= 0 && x < p.cols && y < p.rows, 'inside the board');
          const key = `${x},${y}`;
          assert.ok(!seen.has(key), 'arrows never overlap');
          seen.add(key);
          if (i > 0) {
            const [px, py] = cells[i - 1];
            assert.equal(Math.abs(x - px) + Math.abs(y - py), 1, 'consecutive dots are neighbours');
          }
        });
      }
      assert.ok(seen.size >= 0.9 * p.cols * p.rows, 'board is well filled');
      assert.ok(analyse(lvl).solvable, `${difficulty} #${n} is solvable`);
    }
  });
}

test('difficulties get harder in order: fewer free arrows at a time', () => {
  const mean = (difficulty) => {
    let sum = 0;
    for (let n = 1; n <= 8; n++) sum += generateLevel(difficulty, n).stats.avgFree;
    return sum / 8;
  };
  const [easy, medium, hard, expert] = ['easy', 'medium', 'hard', 'expert'].map(mean);
  assert.ok(easy > medium && medium > hard && hard > expert, `${easy} > ${medium} > ${hard} > ${expert}`);
  assert.ok(expert < 1.6, `expert averages ${expert} free arrows at a time`);
});

test('levels get harder the further you get, up to a ceiling', () => {
  for (const difficulty of Object.keys(DIFFICULTIES)) {
    const first = levelParams(difficulty, 1);
    const top = levelParams(difficulty, RAMP_LEVELS);
    assert.ok(top.cols * top.rows > first.cols * first.rows, `${difficulty}: the board grows`);
    assert.ok(top.aimFree < first.aimFree, `${difficulty}: fewer free arrows at a time`);
    for (let n = 2; n <= RAMP_LEVELS; n++) {
      const [a, b] = [levelParams(difficulty, n - 1), levelParams(difficulty, n)];
      assert.ok(b.cols >= a.cols && b.rows >= a.rows && b.aimFree <= a.aimFree, `${difficulty} ${n} is no easier`);
    }
    assert.deepEqual(levelParams(difficulty, 500), top, `${difficulty}: stays at the ceiling`);
  }
  const mean = (difficulty, from) => {
    let sum = 0;
    for (let n = from; n < from + 6; n++) sum += generateLevel(difficulty, n).stats.avgFree;
    return sum / 6;
  };
  for (const difficulty of ['easy', 'medium', 'hard']) {
    const [early, late] = [mean(difficulty, 1), mean(difficulty, RAMP_LEVELS)];
    assert.ok(late < early, `${difficulty}: ${late} free arrows at a time late vs ${early} early`);
  }
});
