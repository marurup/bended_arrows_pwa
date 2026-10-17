// Canvas rendering, animation and touch handling for the board.

const LINE_W = 0.17; // line width, in dot spacings
const TIP = 0.36; // arrow tip, ahead of the head dot
const BACK = 0.1; // back corners of the arrowhead, behind the head dot
const HALF = 0.28; // half width of the arrowhead
const MARGIN = 0.75; // paper shown around the outer dots
const MAX_ZOOM = 3.5;
const TAP_SLOP = 10; // px a finger may move and still count as a tap
const AMBIGUOUS = 0.2; // dot spacings: closer calls than this between two arrows are ignored

const easeIn = (u) => 0.2 * u + 0.8 * u * u;
const easeOut = (u) => 1 - (1 - u) * (1 - u);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export class BoardView {
  constructor(canvas, { onTap, onZoomChange }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onTap = onTap;
    this.onZoomChange = onZoomChange;
    this.board = null;
    this.colors = [];
    this.anims = new Map();
    this.flashes = new Map();
    this.hint = null;
    this.shake = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.width = 0;
    this.height = 0;
    this.frame = 0;
    this.pointers = new Map();
    this.gesture = null;
    this.readTheme();
    this.bindInput();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  // Call after switching between light and dark.
  refreshTheme() {
    this.readTheme();
    this.assignColors();
    this.requestDraw();
  }

  readTheme() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    this.theme = {
      paper: v('--paper'),
      grid: v('--grid'),
      frame: v('--frame'),
      dot: v('--dot'),
      ink: v('--ink'),
      palette: v('--ink-palette')
        .split(',')
        .map((c) => c.trim()),
      danger: v('--danger'),
      hint: v('--hint'),
    };
  }

  setBoard(board, { colored }) {
    this.board = board;
    this.colored = colored;
    this.anims.clear();
    this.flashes.clear();
    this.hint = null;
    this.assignColors();
    this.resetZoom();
    this.resize();
  }

  // Neighbouring arrows get different colours where the palette allows.
  assignColors() {
    if (!this.board) return;
    const { arrows } = this.board;
    if (!this.colored) {
      this.colors = arrows.map(() => this.theme.ink);
      return;
    }
    const pal = this.theme.palette;
    const picked = [];
    for (const a of arrows) {
      const taken = new Set();
      for (const [x, y] of a.cells) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const o = this.board.at(x + dx, y + dy);
          if (o !== -1 && o < a.id) taken.add(picked[o]);
        }
      }
      const options = pal.map((_, i) => i).filter((i) => !taken.has(i));
      const choice = options.length ? options[(a.id * 7) % options.length] : a.id % pal.length;
      picked.push(choice);
    }
    this.colors = picked.map((i) => pal[i]);
  }

  resize() {
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.dpr = dpr;
    this.width = w;
    this.height = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.board) {
      const { cols, rows } = this.board;
      this.base = Math.min(w / (cols - 1 + 2 * MARGIN), h / (rows - 1 + 2 * MARGIN));
    }
    this.clampPan();
    this.requestDraw();
  }

  // Screen position of dot (0, 0) and the current dot spacing.
  layout() {
    const { cols, rows } = this.board;
    const s = this.base * this.zoom;
    const cx = this.width / 2;
    const cy = this.height / 2;
    let ox = cx - ((cols - 1) * s) / 2 + this.panX;
    let oy = cy - ((rows - 1) * s) / 2 + this.panY;
    if (this.shake) {
      const u = (performance.now() - this.shake.start) / this.shake.duration;
      if (u >= 1) this.shake = null;
      else {
        const amp = 5 * (1 - u);
        ox += Math.sin(u * 40) * amp;
        oy += Math.cos(u * 33) * amp * 0.5;
      }
    }
    return { s, ox, oy };
  }

  resetZoom() {
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.onZoomChange?.(false);
    this.requestDraw();
  }

  clampPan() {
    if (!this.board) return;
    const { cols, rows } = this.board;
    const bw = (cols - 1 + 2 * MARGIN) * this.base * this.zoom;
    const bh = (rows - 1 + 2 * MARGIN) * this.base * this.zoom;
    const mx = Math.max(0, (bw - this.width) / 2);
    const my = Math.max(0, (bh - this.height) / 2);
    this.panX = clamp(this.panX, -mx, mx);
    this.panY = clamp(this.panY, -my, my);
  }

  // Zoom by factor f keeping screen point (px, py) fixed.
  zoomAt(px, py, f) {
    const z = clamp(this.zoom * f, 1, MAX_ZOOM);
    f = z / this.zoom;
    const cx = this.width / 2 + this.panX;
    const cy = this.height / 2 + this.panY;
    this.panX += (px - cx) * (1 - f);
    this.panY += (py - cy) * (1 - f);
    this.zoom = z;
    this.clampPan();
    this.onZoomChange?.(this.zoom > 1.01);
    this.requestDraw();
  }

  // ---- animations -------------------------------------------------------

  // Dots the arrow travels through when it slides forward: its own body,
  // then straight on from the head.
  track(id, extra) {
    const a = this.board.arrows[id];
    const pts = a.cells.map(([x, y]) => [x, y]);
    const [hx, hy] = pts[pts.length - 1];
    for (let k = 1; k <= extra; k++) pts.push([hx + a.dx * k, hy + a.dy * k]);
    return pts;
  }

  animateExit(id, rayLength) {
    const len = this.board.arrows[id].cells.length;
    const dist = rayLength + len + 1;
    if (this.hint?.id === id) this.hint = null;
    this.anims.set(id, {
      type: 'exit',
      start: performance.now(),
      duration: Math.min(850, 220 + dist * 26),
      dist,
      track: this.track(id, dist + 1),
    });
    this.requestDraw();
  }

  animateBump(id, steps, blockerId, onImpact, onDone) {
    const reach = Math.max(0.15, steps - 1 + (1 - TIP - LINE_W / 2));
    const forward = 90 + reach * 45;
    this.anims.set(id, {
      type: 'bump',
      start: performance.now(),
      forward,
      duration: forward + 320,
      reach,
      blockerId,
      onImpact,
      onDone,
      hit: false,
      track: this.track(id, Math.ceil(reach) + 1),
    });
    this.requestDraw();
  }

  isAnimating(id) {
    return this.anims.has(id);
  }

  showHint(id) {
    this.hint = { id, start: performance.now() };
    this.requestDraw();
  }

  // ---- drawing ----------------------------------------------------------

  requestDraw() {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.draw(t));
  }

  draw() {
    this.frame = 0;
    if (!this.board || !this.width) return;
    const now = performance.now();
    const { ctx, theme } = this;
    const { cols, rows } = this.board;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = theme.paper;
    ctx.fillRect(0, 0, this.width, this.height);

    const { s, ox, oy } = this.layout();
    const X = (x) => ox + x * s;
    const Y = (y) => oy + y * s;

    // Squared paper across the whole screen, lined up with the dots.
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = Math.floor(-ox / s); X(i) <= this.width; i++) {
      const x = Math.round(X(i)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
    }
    for (let j = Math.floor(-oy / s); Y(j) <= this.height; j++) {
      const y = Math.round(Y(j)) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
    }
    ctx.stroke();

    // Board frame
    const m = MARGIN * 0.62;
    ctx.strokeStyle = theme.frame;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.setLineDash([s * 0.18, s * 0.14]);
    roundRect(ctx, X(-m), Y(-m), (cols - 1 + 2 * m) * s, (rows - 1 + 2 * m) * s, s * 0.3);
    ctx.stroke();
    ctx.setLineDash([]);

    // Dots
    ctx.fillStyle = theme.dot;
    const r = Math.max(1.3, s * 0.065);
    ctx.beginPath();
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        ctx.moveTo(X(x) + r, Y(y));
        ctx.arc(X(x), Y(y), r, 0, Math.PI * 2);
      }
    }
    ctx.fill();

    const lw = Math.max(2.2, s * LINE_W);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Hint glow underneath everything else
    if (this.hint) {
      const t = (now - this.hint.start) / 1000;
      if (t > 4 || this.board.removed[this.hint.id]) this.hint = null;
      else {
        const a = this.board.arrows[this.hint.id];
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * Math.PI * 2.5) ** 2;
        this.strokeArrow(a.cells, a.dx, a.dy, theme.hint, lw * 3.4, X, Y);
        ctx.globalAlpha = 1;
      }
    }

    // The arrow that was in the way glows red for a moment.
    for (const [id, until] of this.flashes) {
      if (now > until) {
        this.flashes.delete(id);
        continue;
      }
      if (this.board.removed[id] || this.anims.has(id)) continue;
      const a = this.board.arrows[id];
      ctx.globalAlpha = 0.45 * Math.min(1, (until - now) / 200);
      this.strokeArrow(a.cells, a.dx, a.dy, theme.danger, lw * 3.2, X, Y);
      ctx.globalAlpha = 1;
    }

    for (const a of this.board.arrows) {
      if (this.anims.has(a.id) || this.board.removed[a.id]) continue;
      this.strokeArrow(a.cells, a.dx, a.dy, this.colors[a.id], lw, X, Y);
    }

    for (const [id, anim] of this.anims) {
      const a = this.board.arrows[id];
      const u = clamp((now - anim.start) / anim.duration, 0, 1);
      let offset;
      let color = this.colors[id];
      if (anim.type === 'exit') {
        offset = anim.dist * easeIn(u);
        ctx.globalAlpha = u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      } else {
        const t = now - anim.start;
        if (t < anim.forward) offset = anim.reach * easeIn(t / anim.forward);
        else {
          if (!anim.hit) {
            anim.hit = true;
            this.flashes.set(anim.blockerId, now + 700);
            this.shake = { start: now, duration: 260 };
            anim.onImpact?.();
          }
          offset = anim.reach * (1 - easeOut((t - anim.forward) / (anim.duration - anim.forward)));
          color = theme.danger;
        }
      }
      this.strokeArrow(slice(anim.track, offset, a.cells.length - 1), a.dx, a.dy, color, lw, X, Y);
      ctx.globalAlpha = 1;
      if (u >= 1) {
        this.anims.delete(id);
        if (anim.type === 'bump') anim.onDone?.();
      }
    }

    if (this.anims.size || this.flashes.size || this.hint || this.shake) this.requestDraw();
  }

  strokeArrow(pts, dx, dy, color, lw, X, Y) {
    const { ctx } = this;
    const [hx, hy] = pts[pts.length - 1];
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    ctx.stroke();
    // Arrowhead
    const px = -dy;
    const py = dx;
    const bx = hx - dx * BACK;
    const by = hy - dy * BACK;
    ctx.lineWidth = Math.max(1, lw * 0.35);
    ctx.beginPath();
    ctx.moveTo(X(hx + dx * TIP), Y(hy + dy * TIP));
    ctx.lineTo(X(bx + px * HALF), Y(by + py * HALF));
    ctx.lineTo(X(bx - px * HALF), Y(by - py * HALF));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ---- input ------------------------------------------------------------

  bindInput() {
    const c = this.canvas;
    const pos = (e) => {
      const r = c.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, { x, y });
      if (this.pointers.size === 1) {
        this.gesture = { type: 'tap', x0: x, y0: y, panX: this.panX, panY: this.panY };
      } else if (this.pointers.size === 2) {
        const [p, q] = [...this.pointers.values()];
        this.gesture = {
          type: 'pinch',
          dist: Math.hypot(p.x - q.x, p.y - q.y) || 1,
          mx: (p.x + q.x) / 2,
          my: (p.y + q.y) / 2,
        };
      }
    });
    c.addEventListener('pointermove', (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      [ptr.x, ptr.y] = pos(e);
      const g = this.gesture;
      if (!g) return;
      if (g.type === 'pinch' && this.pointers.size >= 2) {
        const [p, q] = [...this.pointers.values()];
        const dist = Math.hypot(p.x - q.x, p.y - q.y) || 1;
        const mx = (p.x + q.x) / 2;
        const my = (p.y + q.y) / 2;
        this.panX += mx - g.mx;
        this.panY += my - g.my;
        this.zoomAt(mx, my, dist / g.dist);
        g.dist = dist;
        g.mx = mx;
        g.my = my;
      } else if (g.type === 'tap' || g.type === 'pan') {
        const moved = Math.hypot(ptr.x - g.x0, ptr.y - g.y0);
        if (g.type === 'tap' && moved > TAP_SLOP) g.type = this.zoom > 1.01 ? 'pan' : 'none';
        if (g.type === 'pan') {
          this.panX = g.panX + ptr.x - g.x0;
          this.panY = g.panY + ptr.y - g.y0;
          this.clampPan();
          this.requestDraw();
        }
      }
    });
    const end = (e) => {
      const ptr = this.pointers.get(e.pointerId);
      if (!ptr) return;
      this.pointers.delete(e.pointerId);
      const g = this.gesture;
      if (e.type === 'pointerup' && g?.type === 'tap' && this.pointers.size === 0) {
        const id = this.hitTest(ptr.x, ptr.y);
        if (id !== -1) this.onTap(id);
      }
      // A pinch ending with one finger still down never turns into a tap.
      if (this.pointers.size === 0) this.gesture = null;
      else if (g?.type === 'pinch') this.gesture = { type: 'none' };
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const [x, y] = pos(e);
        this.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  // The arrow closest to a screen point, if any is near enough. A tap that
  // lands about halfway between two arrows is ignored rather than guessed,
  // so a near miss never costs a life.
  hitTest(px, py) {
    if (!this.board) return -1;
    const { s, ox, oy } = this.layout();
    const wx = (px - ox) / s;
    const wy = (py - oy) / s;
    let best = -1;
    let bestD = Infinity;
    let secondD = Infinity;
    for (const a of this.board.arrows) {
      if (this.board.removed[a.id] || this.anims.has(a.id)) continue;
      const pts = a.cells;
      const [hx, hy] = pts[pts.length - 1];
      let d = segDist(wx, wy, hx, hy, hx + a.dx * TIP, hy + a.dy * TIP);
      for (let i = 1; i < pts.length; i++) {
        d = Math.min(d, segDist(wx, wy, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
      }
      if (d < bestD) {
        secondD = bestD;
        bestD = d;
        best = a.id;
      } else if (d < secondD) secondD = d;
    }
    if (bestD > Math.max(0.55, 18 / s)) return -1;
    if (secondD - bestD < AMBIGUOUS) return -1;
    return best;
  }
}

// Polyline covering track positions [offset, offset + length].
function slice(track, offset, length) {
  const at = (t) => {
    const i = Math.min(Math.floor(t), track.length - 2);
    const f = t - i;
    const [x0, y0] = track[i];
    const [x1, y1] = track[i + 1];
    return [x0 + (x1 - x0) * f, y0 + (y1 - y0) * f];
  };
  const pts = [at(offset)];
  for (let i = Math.floor(offset) + 1; i < offset + length; i++) pts.push(track[i]);
  pts.push(at(offset + length));
  return pts;
}

function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
