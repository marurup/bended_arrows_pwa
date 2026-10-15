// Stamps a copy of the game with the commit it is built from. The deploy
// workflow runs it on the files it publishes:
//
//   node scripts/stamp-version.mjs _site
//
// - js/version.js gets the commit hash, date and repository link shown in
//   the menu; version.json gets the same for the "new version" check.
// - Scripts and styles are loaded as file.js?v=<hash> and the service
//   worker's cache is named after the hash, so a new release never mixes
//   with files a browser still holds from the previous one.
//
// GITHUB_SHA, BUILD_DATE and REPO_URL override what is read from git.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/stamp-version.mjs <site dir>');
  process.exit(1);
}
const git = (args) => execSync(`git ${args}`).toString().trim();
const sha = process.env.GITHUB_SHA || git('rev-parse HEAD');
const date = process.env.BUILD_DATE || git(`log -1 --format=%cI ${sha}`);
const repo = process.env.REPO_URL || '';
const v = sha.slice(0, 7);

function edit(file, change) {
  const path = join(dir, file);
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  writeFileSync(path, after);
  return after !== before;
}

writeFileSync(join(dir, 'js/version.js'), `export const BUILD = ${JSON.stringify({ sha, date, repo })};\n`);
writeFileSync(join(dir, 'version.json'), `${JSON.stringify({ sha, date })}\n`);

const stamped = [
  edit('index.html', (s) => s.replace(/(src|href)="((?:js|css)\/[\w-]+\.(?:js|css))"/g, `$1="$2?v=${v}"`)),
  edit('sw.js', (s) => s.replace("const VERSION = 'dev';", `const VERSION = '${v}';`)),
];
if (stamped.includes(false)) throw new Error('index.html or sw.js no longer has what this script stamps');
for (const file of readdirSync(join(dir, 'js'))) {
  if (file.endsWith('.js')) edit(`js/${file}`, (s) => s.replace(/from '\.\/([\w-]+\.js)'/g, `from './$1?v=${v}'`));
}
console.log(`Stamped ${dir} with ${v} (${date})`);
