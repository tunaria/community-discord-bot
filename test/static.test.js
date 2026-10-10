// Offline checks: no network, no token, no database.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { root } = require('./helpers');

const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const jsIn = dir => (fs.existsSync(path.join(root, dir))
  ? fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js')).map(f => `${dir}/${f}`)
  : []);
const publicSources = ['bot.js', 'core.js', 'list_channels.js', ...jsIn('modules'), ...jsIn('scripts')];

// Env names a file reads: process.env.NAME and the first name in env('NAME', ...).
function envNames(src) {
  const used = new Set();
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
  for (const m of src.matchAll(/\benv\('([A-Z0-9_]+)'/g)) used.add(m[1]);
  return used;
}

test('every env var used in public code is listed in .env.example', () => {
  const example = read('.env.example');
  for (const f of publicSources) {
    for (const name of envNames(read(f))) {
      assert.match(example, new RegExp('^' + name + '=', 'm'), `${f}: ${name} missing from .env.example`);
    }
  }
});

test('no hardcoded private addresses, Discord IDs or tokens', () => {
  for (const f of publicSources) {
    const s = read(f);
    assert.doesNotMatch(s, /\b(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d+\.\d+/, `${f}: private IP`);
    assert.doesNotMatch(s, /\b\d{17,20}\b/, `${f}: Discord snowflake ID`);
    assert.doesNotMatch(s, /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27,}/, `${f}: token-like string`);
  }
});

test('bot does not let user text ping everyone by default', () => {
  assert.match(read('core.js'), /allowedMentions:\s*\{\s*parse:\s*\['users'\]/);
});
