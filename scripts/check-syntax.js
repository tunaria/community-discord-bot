// node --check on every .js file in the repo (outside node_modules).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', '.git', '.test-tmp']);
function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
let failed = 0;
for (const f of walk(root)) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
    console.log(`ok   ${path.relative(root, f)}`);
  } catch (e) {
    failed++;
    console.error(`FAIL ${path.relative(root, f)}\n${e.stderr}`);
  }
}
process.exit(failed ? 1 : 0);
