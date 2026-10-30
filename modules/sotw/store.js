// Small JSON-file store for Student of the Week (no database or extra packages needed).
// The file is only created when something is first saved.
const fs = require('fs');
const path = require('path');

const EMPTY = () => ({ nextEntryId: 1, nextWinnerId: 1, entries: [], winners: [], optouts: [], settings: {} });

class Store {
  constructor(file) {
    this.file = file;
    this.data = EMPTY();
    try {
      this.data = { ...EMPTY(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  getSetting(key, fallback = null) { return key in this.data.settings ? this.data.settings[key] : fallback; }
  setSetting(key, value) { this.data.settings[key] = String(value); this.save(); }
  isPaused() { return this.getSetting('paused', '0') === '1'; }

  addOptout(userId) { if (!this.data.optouts.includes(userId)) { this.data.optouts.push(userId); this.save(); } }
  removeOptout(userId) { this.data.optouts = this.data.optouts.filter(u => u !== userId); this.save(); }
  isOptout(userId) { return this.data.optouts.includes(userId); }

  addEntry({ week, userId, author, title, url, description }) {
    const entry = {
      id: this.data.nextEntryId++, week, userId, author, title, url, description,
      status: 'valid', messageId: null, channelId: null, aiScore: null, finalScore: null, reason: '',
      createdAt: new Date().toISOString(),
    };
    this.data.entries.push(entry);
    this.save();
    return entry;
  }

  getEntry(id) { return this.data.entries.find(e => e.id === id) || null; }
  setEntryMessage(id, channelId, messageId) { Object.assign(this.getEntry(id), { channelId, messageId }); this.save(); }
  setEntryStatus(id, status) { this.getEntry(id).status = status; this.save(); }
  setEntryScore(id, aiScore, finalScore, reason) { Object.assign(this.getEntry(id), { aiScore, finalScore, reason }); this.save(); }

  countUserWeek(userId, week) {
    return this.data.entries.filter(e => e.userId === userId && e.week === week && e.status !== 'withdrawn').length;
  }
  urlUsed(url) { return this.data.entries.some(e => e.url === url && e.status !== 'withdrawn'); }
  validEntries(week) { return this.data.entries.filter(e => e.week === week && e.status === 'valid'); }
  userEntries(userId, week) {
    return this.data.entries.filter(e => e.userId === userId && e.week === week && e.status !== 'withdrawn');
  }

  withdrawEntry(id, userId) {
    const e = this.getEntry(id);
    if (!e || e.userId !== userId || e.status !== 'valid') return false;
    e.status = 'withdrawn';
    this.save();
    return true;
  }

  removeUserEntries(userId) {
    for (const e of this.data.entries) if (e.userId === userId && e.status === 'valid') e.status = 'withdrawn';
    this.save();
  }

  addWinner(week, entry, reason, publishAt) {
    const w = {
      id: this.data.nextWinnerId++, week, entryId: entry.id, title: entry.title, author: entry.author,
      url: entry.url, reason: reason || '', state: 'pending', publishAt, createdAt: new Date().toISOString(),
    };
    this.data.winners.push(w);
    this.save();
    return w;
  }

  latest(state) {
    const list = this.data.winners.filter(w => w.state === state);
    return list.length ? list[list.length - 1] : null;
  }
  pendingWinner() { return this.latest('pending'); }
  liveWinner() { return this.latest('live'); }
  setWinnerState(id, state) { this.data.winners.find(w => w.id === id).state = state; this.save(); }
  retireLive() { for (const w of this.data.winners) if (w.state === 'live') w.state = 'past'; this.save(); }
  weekHasWinner(week) { return this.data.winners.some(w => w.week === week); }
}

module.exports = { Store };
