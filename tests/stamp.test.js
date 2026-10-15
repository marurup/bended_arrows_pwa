import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('deploy stamp versions every script, style and the service worker', async () => {
  const site = mkdtempSync(join(tmpdir(), 'site-'));
  for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) {
    cpSync(f, join(site, f), { recursive: true });
  }
  const sha = '0123456789abcdef0123456789abcdef01234567';
  execFileSync('node', ['scripts/stamp-version.mjs', site], {
    env: {
      ...process.env,
      GITHUB_SHA: sha,
      BUILD_DATE: '2026-10-15T21:17:11+02:00',
      REPO_URL: 'https://example.com/r',
    },
  });

  const { BUILD } = await import(join(site, 'js/version.js'));
  assert.deepEqual(BUILD, { sha, date: '2026-10-15T21:17:11+02:00', repo: 'https://example.com/r' });
  assert.equal(JSON.parse(readFileSync(join(site, 'version.json'), 'utf8')).sha, sha);

  const html = readFileSync(join(site, 'index.html'), 'utf8');
  assert.match(html, /src="js\/main\.js\?v=0123456"/);
  assert.match(html, /href="css\/style\.css\?v=0123456"/);
  assert.match(readFileSync(join(site, 'sw.js'), 'utf8'), /const VERSION = '0123456';/);

  for (const f of readdirSync(join(site, 'js'))) {
    const src = readFileSync(join(site, 'js', f), 'utf8');
    const imports = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
    for (const spec of imports) assert.match(spec, /\?v=0123456$/, `${f} imports ${spec} without the version`);
  }
});
