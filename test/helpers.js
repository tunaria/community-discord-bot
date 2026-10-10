// Fakes for driving the bot without Discord, a token or a database.
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function fakeClient() {
  const c = new EventEmitter();
  c.guilds = { cache: new Map() };
  c.guilds.cache.first = () => undefined;
  return c;
}

function fakeMessage(content) {
  const replies = [], sent = [];
  return {
    replies, sent,
    content,
    author: { bot: false, id: '1', tag: 'tester#0001' },
    guild: { id: 'g' },
    member: { id: '1', permissions: { has: () => false }, roles: { cache: new Map() } },
    channel: { name: 'general', send: async x => { sent.push(x); return { delete: async () => {} }; } },
    mentions: { members: { first: () => undefined }, users: { first: () => undefined }, channels: { first: () => undefined } },
    reply: async x => { replies.push(x); return { delete: async () => {} }; },
  };
}

module.exports = { root, fakeClient, fakeMessage };
