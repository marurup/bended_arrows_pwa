// Pure game rules: which arrows are on the board and whether one can leave.
//
// An arrow is a chain of neighbouring grid dots, listed tail -> head. When it
// is tapped it slides forward like a snake: the head travels straight on in
// the direction it points and the body follows its own trail. The body only
// ever moves through dots the arrow already occupied, so the only thing that
// can stop it is another arrow on the straight line ahead of the head.

export class Board {
  constructor(level) {
    this.cols = level.cols;
    this.rows = level.rows;
    this.arrows = level.arrows.map((a, id) => {
      const cells = a.cells.map(([x, y]) => [x, y]);
      const head = cells[cells.length - 1];
      const prev = cells[cells.length - 2];
      return { id, cells, dx: head[0] - prev[0], dy: head[1] - prev[1] };
    });
    this.occ = new Int16Array(this.cols * this.rows).fill(-1);
    for (const a of this.arrows) {
      for (const [x, y] of a.cells) this.occ[y * this.cols + x] = a.id;
    }
    this.removed = new Uint8Array(this.arrows.length);
    this.remaining = this.arrows.length;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  at(x, y) {
    return this.inside(x, y) ? this.occ[y * this.cols + x] : -1;
  }

  // Dots in front of the head, out to the edge of the board.
  ray(id) {
    const a = this.arrows[id];
    const [hx, hy] = a.cells[a.cells.length - 1];
    const out = [];
    for (let x = hx + a.dx, y = hy + a.dy; this.inside(x, y); x += a.dx, y += a.dy) out.push([x, y]);
    return out;
  }

  // The first arrow standing in the way, and how many steps the head can
  // travel before touching it. null when the way out is clear.
  blocker(id) {
    const ray = this.ray(id);
    for (let i = 0; i < ray.length; i++) {
      const other = this.at(ray[i][0], ray[i][1]);
      if (other !== -1 && other !== id) return { id: other, steps: i + 1 };
    }
    return null;
  }

  isFree(id) {
    return !this.removed[id] && this.blocker(id) === null;
  }

  remove(id) {
    if (this.removed[id]) return;
    this.removed[id] = 1;
    this.remaining--;
    for (const [x, y] of this.arrows[id].cells) this.occ[y * this.cols + x] = -1;
  }

  freeArrows() {
    const out = [];
    for (const a of this.arrows) if (this.isFree(a.id)) out.push(a.id);
    return out;
  }
}

// Removing an arrow never blocks another one, so a board is solvable exactly
// when repeatedly removing every free arrow empties it.
export function analyse(level) {
  const board = new Board(level);
  let rounds = 0;
  let freeSum = 0;
  let steps = 0;
  let firstFree = -1;
  while (board.remaining > 0) {
    const free = board.freeArrows();
    if (firstFree < 0) firstFree = free.length;
    if (free.length === 0) return { solvable: false, rounds, firstFree, avgFree: 0 };
    rounds++;
    for (const id of free) {
      freeSum += board.freeArrows().length;
      steps++;
      board.remove(id);
    }
  }
  return { solvable: true, rounds, firstFree, avgFree: steps ? freeSum / steps : 0 };
}
