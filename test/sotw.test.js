// Student of the Week: screening, scoring, the weekly cycle, the web endpoint and the commands.
// Offline: no network, token or Discord.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { root, fakeClient, fakeMessage } = require('./helpers');

const sotw = p => require(path.join(root, 'modules', 'sotw', p));
const { screenEntry, displayText, validateUrl } = sotw('screening.js');
const { weekKey, localWeekdayHour } = sotw('time.js');
const { parseScores, ReactionScorer, AIScorer, flaggedByModeration } = sotw('ai.js');
const { Store } = sotw('store.js');
const { Engine } = sotw('engine.js');
const { Publisher } = sotw('publisher.js');
const { buildConfig } = sotw('config.js');

const tmpRoot = path.join(root, '.test-tmp', 'sotw');
let counter = 0;
const freshDir = () => {
  const d = path.join(tmpRoot, String(process.pid), String(counter++));
  fs.mkdirSync(d, { recursive: true });
  return d;
};

const baseCfg = (over = {}) => ({
  ...buildConfig(() => '', root),
  linkHosts: ['youtube.com', 'imgur.com'], blockedWords: ['badword'], dataDir: freshDir(), vetoHours: 12, ...over,
});

function makeEngine(over = {}, scorer = new ReactionScorer(), reactions = async () => 0) {
  const cfg = baseCfg(over);
  const notes = [];
  const store = new Store(path.join(cfg.dataDir, 'sotw.json'));
  const publisher = new Publisher(cfg);
  const engine = new Engine({
    cfg, store, scorer, publisher, reactionCounter: reactions,
    notify: async (kind, text) => { notes.push([kind, text]); }, log: { error() {} },
  });
  return { cfg, store, publisher, engine, notes };
}

const addEntry = (store, week, n, extra = {}) => store.addEntry({
  week, userId: 'u' + n, author: 'Author' + n, title: 'Guide ' + n, url: 'https://youtube.com/watch?v=' + n,
  description: 'A helpful guide number ' + n, ...extra,
});

test('screening accepts a good entry and strips pings', () => {
  const cfg = baseCfg();
  const ok = screenEntry('My <@123> guide', 'https://youtube.com/watch?v=1', 'A really useful @everyone walkthrough', cfg);
  assert.ok(ok.entry);
  assert.doesNotMatch(ok.entry.title + ok.entry.description, /@everyone|<@/);
});

test('screening rejects bad links, short text and blocked words', () => {
  const cfg = baseCfg();
  const bad = (t, u, d) => assert.ok(screenEntry(t, u, d, cfg).error, `${t} ${u}`);
  bad('Nice title', 'https://evil.example/x', 'A long enough description');
  bad('Nice title', 'javascript:alert(1)', 'A long enough description');
  bad('Nice title', 'https://user:pw@youtube.com/x', 'A long enough description');
  bad('Nice title', 'https://youtube.com.evil.example/x', 'A long enough description');
  bad('Hi', 'https://youtube.com/x', 'A long enough description');
  bad('Nice title', 'https://youtube.com/x', 'short');
  bad('Nice title', 'https://youtube.com/x', 'this has a b4dw0rd inside');
});

test('validateUrl allows subdomains of allowed hosts only', () => {
  assert.ok(validateUrl('https://www.youtube.com/watch?v=1', ['youtube.com']).url);
  assert.ok(validateUrl('https://notyoutube.com/x', ['youtube.com']).error);
});

test('displayText removes links and client-unsafe characters', () => {
  assert.strictEqual(displayText('Look [here] https://x.example/a {b} ok'), 'Look here b ok');
  assert.ok(displayText('x'.repeat(100)).length <= 40);
});

test('week key and weekday use the configured time zone', () => {
  const sunday = new Date('2026-11-02T03:30:00Z'); // Sunday 19:30 in Los Angeles
  assert.deepStrictEqual(localWeekdayHour(sunday, 'America/Los_Angeles'), { weekday: 6, hour: 19 });
  assert.strictEqual(weekKey(sunday, 'America/Los_Angeles'), '2026-W44');
  assert.strictEqual(weekKey(sunday, 'UTC'), '2026-W45');
  assert.strictEqual(weekKey(new Date('2027-01-01T12:00:00Z'), 'UTC'), '2026-W53');
});

test('parseScores clamps scores and ignores unknown ids', () => {
  const out = parseScores('text {"scores":[{"id":1,"score":99,"reason":"great"},{"id":9,"score":5},{"id":2,"score":"x"}]} end', new Set([1, 2]));
  assert.deepStrictEqual([...out.keys()], [1]);
  assert.strictEqual(out.get(1).score, 10);
  assert.throws(() => parseScores('no json here', new Set([1])));
});

test('AI scorer uses the endpoint and fails safe on errors', async () => {
  const cfg = baseCfg({ aiKey: 'k', aiUrl: 'http://ai.invalid', aiModel: 'm' });
  const entries = [{ id: 1, title: 't', description: 'd', url: 'https://youtube.com/x' }];
  let seen;
  const good = async (u, o) => {
    seen = JSON.parse(o.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"scores":[{"id":1,"score":7,"reason":"ok"}]}' } }] }) };
  };
  const scores = await new AIScorer(cfg, good).score(entries);
  assert.strictEqual(scores.get(1).score, 7);
  assert.match(seen.messages[0].content, /untrusted/);
  assert.ok(!JSON.stringify(seen).includes('author'));
  await assert.rejects(new AIScorer(cfg, async () => ({ ok: false, status: 500 })).score(entries));
});

test('moderation rejects flagged text and rejects on errors when set', async () => {
  assert.strictEqual(await flaggedByModeration({ moderationUrl: '' }, 'x'), false);
  const cfg = { moderationUrl: 'http://m.invalid', aiKey: 'k' };
  const reply = flagged => async () => ({ ok: true, json: async () => ({ results: [{ flagged }] }) });
  assert.strictEqual(await flaggedByModeration(cfg, 'x', reply(true)), true);
  assert.strictEqual(await flaggedByModeration(cfg, 'x', reply(false)), false);
  assert.strictEqual(await flaggedByModeration(cfg, 'x', async () => { throw new Error('down'); }), true);
});

test('cycleDue respects the schedule, pause and one pick per week', () => {
  const { engine, store } = makeEngine({ timezone: 'UTC', cycleWeekday: 6, cycleHour: 20 });
  assert.strictEqual(engine.cycleDue(new Date('2026-11-01T19:00:00Z')), false);
  assert.strictEqual(engine.cycleDue(new Date('2026-11-01T20:00:00Z')), true);
  store.setSetting('paused', '1');
  assert.strictEqual(engine.cycleDue(new Date('2026-11-01T21:00:00Z')), false);
});

test('cycle picks by score plus reactions, waits out the veto window, then publishes', async () => {
  const when = new Date('2026-11-01T21:00:00Z');
  const { engine, store, publisher, notes, cfg } = makeEngine({ timezone: 'UTC' }, new ReactionScorer(),
    async e => (e.id === 2 ? 5 : 0));
  const week = engine.currentWeek(when);
  addEntry(store, week, 1);
  addEntry(store, week, 2);
  assert.match(await engine.runCycle(when), /picked entry 2/);
  assert.strictEqual(await engine.publishDue(when), false);
  assert.strictEqual(fs.existsSync(path.join(cfg.dataDir, 'winner.txt')), false);
  const later = new Date(when.getTime() + 13 * 3600000);
  assert.strictEqual(await engine.publishDue(later), true);
  assert.strictEqual(fs.readFileSync(path.join(cfg.dataDir, 'winner.txt'), 'utf8'), 'Guide 2 by Author2\n');
  assert.strictEqual(publisher.read().active, true);
  assert.ok(notes.some(n => n[0] === 'announce'));
  assert.strictEqual(engine.cycleDue(later), false);
});

test('veto promotes the runner-up and revert clears everything and pauses', async () => {
  const when = new Date('2026-11-01T21:00:00Z');
  const { engine, store, publisher } = makeEngine({ timezone: 'UTC' }, new ReactionScorer(), async e => (e.id === 1 ? 5 : 0));
  const week = engine.currentWeek(when);
  addEntry(store, week, 1);
  addEntry(store, week, 2);
  await engine.runCycle(when);
  assert.strictEqual(store.pendingWinner().entryId, 1);
  assert.match(await engine.veto(when), /picked entry 2/);
  assert.strictEqual(store.pendingWinner().entryId, 2);
  assert.match(await engine.veto(when), /no runner-up/);
  assert.match(await engine.veto(when), /no pending/);
  await engine.publishDue(new Date(when.getTime() + 99 * 3600000));
  engine.revert();
  assert.strictEqual(store.isPaused(), true);
  assert.strictEqual(publisher.read().active, false);
  assert.strictEqual(store.liveWinner(), null);
});

test('opted-out authors are skipped and a failing scorer keeps the current banner', async () => {
  const when = new Date('2026-11-01T21:00:00Z');
  const a = makeEngine({ timezone: 'UTC' });
  const week = a.engine.currentWeek(when);
  addEntry(a.store, week, 1);
  a.store.addOptout('u1');
  assert.match(await a.engine.runCycle(when), /no entries/);

  const boom = { score: async () => { throw new Error('ai down'); } };
  const b = makeEngine({ timezone: 'UTC' }, boom);
  addEntry(b.store, week, 1);
  assert.match(await b.engine.runCycle(when), /scoring failed/);
  assert.strictEqual(b.store.pendingWinner(), null);
});

test('store survives a restart and a missing file', () => {
  const dir = freshDir();
  const file = path.join(dir, 'sotw.json');
  assert.strictEqual(new Store(file).data.entries.length, 0);
  const s = new Store(file);
  addEntry(s, '2026-W44', 1);
  assert.strictEqual(new Store(file).data.entries.length, 1);
});

test('web endpoint serves the winner and redirects /student', async () => {
  const cfg = baseCfg({ httpHost: '127.0.0.1', httpPort: 0, publicUrl: 'http://sotw.example' });
  const publisher = new Publisher(cfg);
  publisher.write({ title: 'Guide', author: 'Ann', url: 'https://youtube.com/x', reason: 'Nice', week: '2026-W44' });
  const server = await publisher.startHttp();
  const { port } = server.address();
  const get = p => new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p }, res => {
      let body = '';
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on('error', reject);
  });
  try {
    assert.strictEqual((await get('/healthz')).body, 'ok');
    const json = JSON.parse((await get('/winner.json')).body);
    assert.strictEqual(json.active, true);
    assert.strictEqual(json.short_url, 'http://sotw.example/student');
    assert.strictEqual((await get('/winner.txt')).body, 'Guide by Ann\n');
    const student = await get('/student');
    assert.strictEqual(student.status, 302);
    assert.strictEqual(student.headers.location, 'https://youtube.com/x');
    assert.strictEqual((await get('/nope')).status, 404);
    publisher.write(null);
    assert.strictEqual((await get('/student')).status, 200);
  } finally {
    server.close();
  }
});

test('disabled by default: registers nothing', () => {
  const { createBot } = require(path.join(root, 'core.js'));
  const saved = process.env.SOTW_ENABLED;
  delete process.env.SOTW_ENABLED;
  try {
    const bot = createBot({ root, client: fakeClient() });
    assert.ok(!bot.registry.commands.has('sotw'));
  } finally {
    if (saved !== undefined) process.env.SOTW_ENABLED = saved;
  }
});

test('commands: submit, duplicate, limits, staff checks and kill switch', async () => {
  const dir = freshDir();
  Object.assign(process.env, {
    SOTW_ENABLED: 'true', SOTW_DATA_DIR: dir, SOTW_LINK_HOSTS: 'youtube.com', SOTW_MAX_PER_WEEK: '1',
  });
  const { createBot } = require(path.join(root, 'core.js'));
  const bot = createBot({ root, client: fakeClient() });
  assert.ok(bot.registry.commands.has('sotw') && bot.registry.commands.has('student'));

  const say = async (text, tweak) => {
    const m = fakeMessage(text);
    m.author.createdTimestamp = Date.now() - 400 * 86400000;
    m.member.joinedTimestamp = Date.now() - 100 * 86400000;
    if (tweak) tweak(m);
    await bot.handleMessage(m);
    return m;
  };
  const text = m => JSON.stringify(m.replies);

  assert.match(text(await say('!sotw submit')), /Usage/);
  const young = await say('!sotw submit https://youtube.com/a Title one | A long enough description', m => { m.author.createdTimestamp = Date.now(); });
  assert.match(text(young), /too new/);
  const ok = await say('!sotw submit https://youtube.com/a Title one | A long enough description');
  assert.match(text(ok), /Entry #1 received/);
  assert.strictEqual(ok.channel.name, 'general');
  const second = await say('!sotw submit https://youtube.com/b Title two | Another long description', m => { m.author.id = '1'; });
  assert.match(text(second), /wait a few seconds/);
  const other = await say('!sotw submit https://youtube.com/a Title one | A long enough description', m => { m.author.id = '2'; });
  assert.match(text(other), /already been submitted/);
  assert.match(text(await say('!sotw mine')), /Title one/);

  assert.match(text(await say('!sotw run')), /Manage Server/);
  assert.match(text(await say('!sotw constructor')), /Usage/);
  const staff = m => { m.member.permissions.has = () => true; };
  assert.match(text(await say('!sotw status', staff)), /Entries this week: 1/);
  assert.match(text(await say('!sotw revert', staff)), /paused/);
  assert.match(text(await say('!student')), /No Student of the Week/);
});
