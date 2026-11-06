// Loader checks: the public modules load and run with no private/ folder.
const test = require('node:test');
const assert = require('node:assert');
const { root, fakeClient, fakeMessage } = require('./helpers');

test('loads the public modules and runs', async () => {
  const { createBot } = require(require('path').join(root, 'core.js'));
  const bot = createBot({ root, client: fakeClient() });
  assert.deepStrictEqual(bot.registry.modules, ['modules/group-tools.js', 'modules/role-select.js', 'modules/student-of-the-week.js']);
  assert.deepStrictEqual([...bot.registry.commands.keys()].sort(), ['boss', 'help', 'lfg', 'raid']);
  assert.ok(bot.registry.buttons.has('role_remove_all'));

  const unknown = fakeMessage('!notacommand x');
  await bot.handleMessage(unknown);
  assert.strictEqual(unknown.replies.length + unknown.sent.length, 0);

  const lfg = fakeMessage('!lfg Tank');
  await bot.handleMessage(lfg);
  assert.strictEqual(lfg.sent.length, 1);

  const help = fakeMessage('!help');
  await bot.handleMessage(help);
  assert.ok(help.replies[0].embeds[0].toJSON().fields.length > 0);
});
