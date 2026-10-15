// Draws the app icon as SVG and renders the PNG sizes a PWA needs.
// Usage: node scripts/make-icons.mjs   (needs Playwright with Chromium)
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(`${execSync('npm root -g').toString().trim()}/playwright`);
}

const S = 80; // dot spacing on a 512 canvas
const O = 96; // first dot
const P = (x, y) => [O + x * S, O + y * S];
const ARROWS = [
  {
    color: '#1f3f76',
    cells: [
      [0, 4],
      [0, 2],
      [2, 2],
      [2, 0],
    ],
  },
  {
    color: '#c4372b',
    cells: [
      [4, 2],
      [4, 4],
      [1, 4],
    ],
  },
  {
    color: '#17806f',
    cells: [
      [3, 3],
      [3, 0],
    ],
  },
];
// Every dot an arrow passes through, so only the empty ones get drawn.
const USED = new Set();
for (const { cells } of ARROWS) {
  for (let i = 1; i < cells.length; i++) {
    const [x0, y0] = cells[i - 1];
    const [x1, y1] = cells[i];
    for (let k = 0; k <= Math.abs(x1 - x0) + Math.abs(y1 - y0); k++) {
      USED.add(`${x0 + Math.sign(x1 - x0) * k},${y0 + Math.sign(y1 - y0) * k}`);
    }
  }
}

function arrowSvg({ color, cells }) {
  const pts = cells.map(([x, y]) => P(x, y));
  const [hx, hy] = pts[pts.length - 1];
  const [px, py] = pts[pts.length - 2];
  const len = Math.hypot(hx - px, hy - py);
  const dx = (hx - px) / len;
  const dy = (hy - py) / len;
  const tip = [hx + dx * S * 0.42, hy + dy * S * 0.42];
  const back = [hx - dx * S * 0.12, hy - dy * S * 0.12];
  const half = S * 0.34;
  const c1 = [back[0] - dy * half, back[1] + dx * half];
  const c2 = [back[0] + dy * half, back[1] - dx * half];
  return (
    `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${S * 0.22}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<polygon points="${[tip, c1, c2].map((p) => p.join(',')).join(' ')}" fill="${color}" stroke="${color}" stroke-width="8" stroke-linejoin="round"/>`
  );
}

function iconSvg({ rounded, scale = 1 }) {
  const lines = [];
  for (let i = -2; i <= 6; i++) {
    const v = O + i * S;
    lines.push(`<line x1="${v}" y1="0" x2="${v}" y2="512"/><line x1="0" y1="${v}" x2="512" y2="${v}"/>`);
  }
  const dots = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (!USED.has(`${x},${y}`)) dots.push(`<circle cx="${P(x, y)[0]}" cy="${P(x, y)[1]}" r="7"/>`);
    }
  }
  const t = 256 * (1 - scale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<defs><clipPath id="c"><rect width="512" height="512" rx="${rounded ? 112 : 0}"/></clipPath></defs>
<g clip-path="url(#c)">
<rect width="512" height="512" fill="#f6f3ea"/>
<g transform="translate(${t} ${t}) scale(${scale})">
<g stroke="#d6e1ec" stroke-width="4">${lines.join('')}</g>
<g fill="#aebccb">${dots.join('')}</g>
${ARROWS.map(arrowSvg).join('\n')}
</g>
</g>
</svg>
`;
}

const regular = iconSvg({ rounded: true });
const square = iconSvg({ rounded: false });
const maskable = iconSvg({ rounded: false, scale: 0.78 });
writeFileSync('icons/icon.svg', regular);

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
async function render(svg, size, file) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`,
  );
  await page.screenshot({ path: file, omitBackground: true });
}
await render(regular, 192, 'icons/icon-192.png');
await render(regular, 512, 'icons/icon-512.png');
await render(maskable, 512, 'icons/icon-maskable-512.png');
await render(square, 180, 'icons/apple-touch-icon.png');
await browser.close();
console.log('icons written');
