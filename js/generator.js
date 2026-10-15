// Level generator.
//
// Boards are built backwards: every new arrow must have a clear path to the
// edge through the arrows already placed. Removing the arrows in the reverse
// order of placement therefore always works, so every board is solvable.
// Later arrows are free to land in the paths of earlier ones; that is what
// creates the "which one can go first?" puzzle.
//
// Difficulty is steered by how arrows are chosen: on hard levels each new
// arrow preferably blocks one that is currently free, keeping the number of
// removable arrows low and the chains long; on easy levels new arrows try to
// stay out of each other's way.

import { createRng } from './rng.js';
import { analyse } from './board.js';

export const GENERATOR_VERSION = 1;

// prettier-ignore
export const DIFFICULTIES = {
  easy: {
    label: 'Let',
    cols: 6, rows: 8, lives: 5, hints: 3, colored: true,
    minLen: 2, maxLen: 4, bend: 0.3, hug: 0.6,
    depthBias: 1, targetFree: 99, wDep: -3, wFree: 0, freeBias: 1, wZero: 0, minFill: 1, aimFree: 8,
  },
  medium: {
    label: 'Mellem',
    cols: 8, rows: 11, lives: 4, hints: 2, colored: true,
    minLen: 2, maxLen: 6, bend: 0.35, hug: 0.6,
    depthBias: 1.5, targetFree: 4, wDep: 0.5, wFree: 2, freeBias: 2, wZero: 2, minFill: 0.96, aimFree: 4,
  },
  hard: {
    label: 'Svær',
    cols: 10, rows: 14, lives: 3, hints: 1, colored: false,
    minLen: 3, maxLen: 9, bend: 0.45, hug: 0.7,
    depthBias: 2, targetFree: 2, wDep: 1.5, wFree: 6, freeBias: 6, wZero: 8, minFill: 0.92, aimFree: 3,
  },
  expert: {
    label: 'Ekspert',
    cols: 12, rows: 17, lives: 2, hints: 0, colored: false,
    minLen: 3, maxLen: 14, bend: 0.5, hug: 0.8,
    depthBias: 2.5, targetFree: 1, wDep: 2.5, wFree: 10, freeBias: 10, wZero: 14, minFill: 0.9, aimFree: 1,
  },
};

const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const CANDIDATES = 14;
const ATTEMPTS = 6;

function attempt(cols, rows, p, rng) {
  const N = cols * rows;
  // nb[i * 4 + d] = neighbour of dot i in direction d, or -1 off the board.
  const nb = new Int32Array(N * 4);
  for (let i = 0; i < N; i++) {
    const x = i % cols;
    const y = (i / cols) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      nb[i * 4 + d] = nx < 0 || ny < 0 || nx >= cols || ny >= rows ? -1 : ny * cols + nx;
    }
  }
  const depth = new Int32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % cols;
    const y = (i / cols) | 0;
    depth[i] = Math.min(x, y, cols - 1 - x, rows - 1 - y);
  }

  const occ = new Int32Array(N).fill(-1);
  const arrows = []; // { cells: [dot] tail -> head, dir, order }
  const rayOwners = Array.from({ length: N }, () => []);
  const blockCount = [];
  let freeCount = 0;

  const rayOf = (head, d) => {
    const out = [];
    for (let j = nb[head * 4 + d]; j !== -1; j = nb[j * 4 + d]) out.push(j);
    return out;
  };
  const rayClear = (head, d, grid) => {
    for (let j = nb[head * 4 + d]; j !== -1; j = nb[j * 4 + d]) if (grid[j] !== -1) return false;
    return true;
  };
  const canHead = (i, d, grid) => {
    const back = nb[i * 4 + ((d + 2) & 3)];
    return back !== -1 && grid[back] === -1 && rayClear(i, d, grid);
  };

  // Empty dots that can no longer become part of any arrow: they are not
  // within reach of a dot that could still serve as an arrow head.
  const dist = new Int32Array(N);
  const queue = new Int32Array(N);
  const countDoomed = (grid) => {
    dist.fill(-1);
    let qh = 0;
    let qt = 0;
    for (let i = 0; i < N; i++) {
      if (grid[i] !== -1) continue;
      for (let d = 0; d < 4; d++) {
        if (canHead(i, d, grid)) {
          dist[i] = 0;
          queue[qt++] = i;
          break;
        }
      }
    }
    while (qh < qt) {
      const i = queue[qh++];
      if (dist[i] >= p.maxLen - 1) continue;
      for (let d = 0; d < 4; d++) {
        const j = nb[i * 4 + d];
        if (j !== -1 && grid[j] === -1 && dist[j] === -1) {
          dist[j] = dist[i] + 1;
          queue[qt++] = j;
        }
      }
    }
    let doomed = 0;
    for (let i = 0; i < N; i++) if (grid[i] === -1 && dist[i] === -1) doomed++;
    return doomed;
  };

  // Grow a body backwards from the head, wandering through empty dots.
  const grow = (head, d, targetLen) => {
    const body = [head, nb[head * 4 + ((d + 2) & 3)]];
    const used = new Set(body);
    const ray = new Set(rayOf(head, d));
    let cur = body[1];
    let walk = (d + 2) & 3;
    while (body.length < targetLen) {
      const opts = [];
      let total = 0;
      for (const [nd, base] of [
        [walk, 1 - p.bend],
        [(walk + 1) & 3, p.bend / 2],
        [(walk + 3) & 3, p.bend / 2],
      ]) {
        const nx = nb[cur * 4 + nd];
        if (nx === -1 || occ[nx] !== -1 || used.has(nx) || ray.has(nx)) continue;
        let open = 0;
        for (let dd = 0; dd < 4; dd++) {
          const m = nb[nx * 4 + dd];
          if (m !== -1 && occ[m] === -1 && !used.has(m)) open++;
        }
        const w = (Math.max(base, 0.03) * (inFreeRay[nx] ? p.freeBias : 1)) / (1 + p.hug * open);
        opts.push([nx, nd, w]);
        total += w;
      }
      if (!opts.length) break;
      let r = rng.next() * total;
      let choice = opts[opts.length - 1];
      for (const o of opts) {
        r -= o[2];
        if (r <= 0) {
          choice = o;
          break;
        }
      }
      body.push(choice[0]);
      used.add(choice[0]);
      cur = choice[0];
      walk = choice[1];
    }
    return body.reverse();
  };

  const place = (cells, dir, order) => {
    const id = arrows.length;
    arrows.push({ cells, dir, order });
    for (const c of cells) {
      occ[c] = id;
      for (const a of rayOwners[c]) {
        if (blockCount[a]++ === 0) freeCount--;
      }
    }
    for (const c of rayOf(cells[cells.length - 1], dir)) rayOwners[c].push(id);
    blockCount.push(0);
    freeCount++;
  };

  const scratch = new Int32Array(N);
  const inFreeRay = new Uint8Array(N);
  let filled = 0;
  for (;;) {
    const heads = [];
    let weightSum = 0;
    for (let i = 0; i < N; i++) {
      if (occ[i] !== -1) continue;
      for (let d = 0; d < 4; d++) {
        if (!canHead(i, d, occ)) continue;
        const w = Math.pow(1 + depth[i], p.depthBias);
        heads.push([i, d, w]);
        weightSum += w;
      }
    }
    if (!heads.length) break;

    // Dots on the way out of a currently free arrow. Building there blocks it.
    inFreeRay.fill(0);
    if (freeCount > p.targetFree) {
      for (let i = 0; i < N; i++) {
        if (occ[i] !== -1) continue;
        for (const a of rayOwners[i]) if (blockCount[a] === 0) inFreeRay[i] = 1;
      }
      weightSum = 0;
      for (const h of heads) {
        const back = nb[h[0] * 4 + ((h[1] + 2) & 3)];
        if (inFreeRay[h[0]] || inFreeRay[back]) h[2] *= p.freeBias;
        weightSum += h[2];
      }
    }

    const doomedBefore = countDoomed(occ);
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < CANDIDATES; k++) {
      let r = rng.next() * weightSum;
      let h = heads[heads.length - 1];
      for (const cand of heads) {
        r -= cand[2];
        if (r <= 0) {
          h = cand;
          break;
        }
      }
      const cells = grow(h[0], h[1], rng.range(p.minLen, p.maxLen));

      scratch.set(occ);
      for (const c of cells) scratch[c] = 0;
      const newlyDoomed = countDoomed(scratch) - doomedBefore;

      const blockedFree = new Set();
      const blockedAny = new Set();
      for (const c of cells) {
        for (const a of rayOwners[c]) {
          blockedAny.add(a);
          if (blockCount[a] === 0) blockedFree.add(a);
        }
      }
      const freeAfter = freeCount + 1 - blockedFree.size;
      // An arrow whose head sits on the edge pointing out can never be
      // blocked, so it stays free for the whole game.
      const zeroRay = nb[h[0] * 4 + h[1]] === -1;
      const score =
        -p.wZero * zeroRay +
        -40 * newlyDoomed -
        6 * Math.max(0, p.minLen - cells.length) +
        0.8 * cells.length -
        p.wFree * Math.max(0, freeAfter - p.targetFree) +
        p.wDep * blockedAny.size +
        rng.next() * 2;
      if (score > bestScore) {
        bestScore = score;
        best = { cells, dir: h[1], adds: freeAfter > p.targetFree && blockedFree.size === 0 };
      }
    }
    // Once the board is full enough, stop rather than add yet another arrow
    // that is free from the start.
    if (best.adds && filled >= p.minFill * N) break;
    place(best.cells, best.dir, arrows.length);
    filled += best.cells.length;
  }

  fillHoles(cols, rows, p, nb, occ, arrows, rayOwners, rayOf);
  const merged = mergeArrows(p, nb, occ, arrows, rayOf, rng);

  return {
    cols,
    rows,
    arrows: merged
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((a) => ({ cells: a.cells.map((c) => [c % cols, (c / cols) | 0]) })),
  };
}

// Patch up dots left over at the end by stretching neighbouring arrows into
// them or slotting in short new arrows, keeping the board solvable. Every
// arrow carries an "order": it must be removable once all arrows with a
// higher order are gone.
function fillHoles(cols, rows, p, nb, occ, arrows, rayOwners, rayOf) {
  const N = cols * rows;
  const maxLen = p.maxLen + 2;
  const maxOrderOf = (ids) => ids.reduce((m, a) => Math.max(m, arrows[a].order), -Infinity);
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < N; c++) {
      if (occ[c] !== -1) continue;
      for (let d = 0; d < 4 && occ[c] === -1; d++) {
        const n = nb[c * 4 + d];
        if (n === -1 || occ[n] === -1) continue;
        const a = arrows[occ[n]];
        const id = occ[n];
        if (a.cells.length >= maxLen) continue;
        const owners = rayOwners[c].filter((o) => o !== id);
        const ownRay = rayOwners[c].includes(id);
        // Arrows that must leave before this one may not be blocked by it.
        if (owners.length && maxOrderOf(owners) > a.order) continue;
        if (a.cells[0] === n && !ownRay) {
          a.cells.unshift(c);
          occ[c] = id;
          changed = true;
        } else if (a.cells[a.cells.length - 1] === n && d === ((a.dir + 2) & 3) && ownRay) {
          // c is straight ahead of the head: the arrow simply gets longer.
          a.cells.push(c);
          occ[c] = id;
          rayOwners[c] = owners;
          changed = true;
        }
      }
    }
    // Two neighbouring empty dots can become a new short arrow if it fits
    // somewhere in the removal order.
    for (let c = 0; c < N && !changed; c++) {
      if (occ[c] !== -1) continue;
      for (let d = 0; d < 4 && !changed; d++) {
        const h = nb[c * 4 + d];
        if (h === -1 || occ[h] !== -1) continue;
        const ray = rayOf(h, d);
        const lo = maxOrderOf([...rayOwners[c], ...rayOwners[h]]);
        let hi = Infinity;
        let selfHit = false;
        for (const r of ray) {
          if (r === c) selfHit = true;
          if (occ[r] !== -1) hi = Math.min(hi, arrows[occ[r]].order);
        }
        if (selfHit || !(lo < hi)) continue;
        if (hi === Infinity && p.targetFree < 99) continue;
        const order = lo === -Infinity ? (hi === Infinity ? 0 : hi - 1) : hi === Infinity ? lo + 1 : (lo + hi) / 2;
        const id = arrows.length;
        arrows.push({ cells: [c, h], dir: d, order });
        occ[c] = id;
        occ[h] = id;
        for (const r of ray) rayOwners[r].push(id);
        changed = true;
      }
    }
  }
}

// The last arrows placed fill small leftover pockets and tend to be short
// and free. Join such an arrow onto the tail of a neighbour, which then
// carries it along as extra body. Repeats until there are no more than the
// wanted number of free arrows and no arrows below the minimum length.
function mergeArrows(p, nb, occ, arrows, rayOf, rng) {
  const N = occ.length;
  const alive = arrows.map(() => true);
  const maxLen = p.maxLen + 3;
  const near = (a, b) => {
    for (let d = 0; d < 4; d++) if (nb[a * 4 + d] === b) return true;
    return false;
  };
  for (;;) {
    const rays = arrows.map((a, i) => (alive[i] ? rayOf(a.cells[a.cells.length - 1], a.dir) : []));
    const owners = Array.from({ length: N }, () => []);
    rays.forEach((ray, i) => ray.forEach((c) => owners[c].push(i)));
    const free = [];
    for (let i = 0; i < arrows.length; i++) {
      if (alive[i] && rays[i].every((c) => occ[c] === -1 || occ[c] === i)) free.push(i);
    }
    const pool = [];
    for (let i = 0; i < arrows.length; i++) {
      if (!alive[i]) continue;
      if (arrows[i].cells.length < p.minLen || (free.length > p.targetFree && free.includes(i))) pool.push(i);
    }
    rng.shuffle(pool);
    let done = false;
    for (const x of pool) {
      const X = arrows[x];
      const opts = [];
      for (let y = 0; y < arrows.length; y++) {
        if (y === x || !alive[y]) continue;
        const Y = arrows[y];
        if (X.cells.length + Y.cells.length > maxLen) continue;
        const tail = Y.cells[0];
        let body = null;
        if (near(X.cells[X.cells.length - 1], tail)) body = X.cells;
        else if (near(X.cells[0], tail)) body = X.cells.slice().reverse();
        if (!body) continue;
        if (rays[y].some((c) => occ[c] === x)) continue;
        // Arrows whose way out crosses the joined arrow must leave after it,
        // arrows in front of it must leave before it.
        let lo = -Infinity;
        for (const c of [...X.cells, ...Y.cells]) {
          for (const o of owners[c]) if (o !== x && o !== y) lo = Math.max(lo, arrows[o].order);
        }
        let hi = Infinity;
        for (const c of rays[y])
          if (occ[c] !== -1 && occ[c] !== x && occ[c] !== y) hi = Math.min(hi, arrows[occ[c]].order);
        if (!(lo < hi)) continue;
        opts.push({ y, body, lo, hi });
      }
      if (!opts.length) continue;
      const o = rng.pick(opts);
      const Y = arrows[o.y];
      Y.cells = [...o.body, ...Y.cells];
      Y.order =
        o.lo === -Infinity
          ? o.hi === Infinity
            ? Y.order
            : o.hi - 1
          : o.hi === Infinity
            ? o.lo + 1
            : (o.lo + o.hi) / 2;
      for (const c of X.cells) occ[c] = o.y;
      alive[x] = false;
      done = true;
      break;
    }
    if (!done) break;
  }
  return arrows.filter((_, i) => alive[i]);
}

function quality(level, p, stats) {
  const filled = level.arrows.reduce((s, a) => s + a.cells.length, 0);
  const fill = filled / (level.cols * level.rows);
  // Easy levels want many free arrows at a time, hard levels few and long
  // chains of arrows waiting on each other.
  const challenge = -Math.abs(stats.avgFree - p.aimFree) + stats.rounds * 0.1;
  return challenge + fill * 6 - Math.max(0, p.minFill - fill) * 60;
}

export function generateLevel(difficulty, levelNumber) {
  const p = DIFFICULTIES[difficulty];
  const seed = `${difficulty}:${levelNumber}:v${GENERATOR_VERSION}`;
  const rng = createRng(seed);
  let best = null;
  let bestQ = -Infinity;
  for (let i = 0; i < ATTEMPTS; i++) {
    const level = attempt(p.cols, p.rows, p, rng);
    const stats = analyse(level);
    if (!stats.solvable) continue;
    const q = quality(level, p, stats);
    if (q > bestQ) {
      bestQ = q;
      best = { ...level, stats };
    }
  }
  return { ...best, difficulty, levelNumber, seed };
}
