// Weekly cycle for Student of the Week: score, pick, veto window, publish. No Discord dependency.
const { weekKey, localWeekdayHour } = require('./time');

const noReactions = async () => 0;

class Engine {
  constructor({ cfg, store, scorer, publisher, notify, reactionCounter, log = console }) {
    this.cfg = cfg;
    this.store = store;
    this.scorer = scorer;
    this.publisher = publisher;
    this.notify = notify;
    this.reactionCounter = reactionCounter || noReactions;
    this.log = log;
  }

  currentWeek(now = new Date()) { return weekKey(now, this.cfg.timezone); }

  cycleDue(now = new Date()) {
    const week = this.currentWeek(now);
    if (this.store.isPaused() || this.store.weekHasWinner(week)) return false;
    if (this.store.getSetting('last_cycle_week') === week) return false;
    const { weekday, hour } = localWeekdayHour(now, this.cfg.timezone);
    return weekday > this.cfg.cycleWeekday || (weekday === this.cfg.cycleWeekday && hour >= this.cfg.cycleHour);
  }

  async rank(week) {
    const entries = this.store.validEntries(week).filter(e => !this.store.isOptout(e.userId));
    if (!entries.length) return [];
    const reactions = new Map();
    for (const e of entries) reactions.set(e.id, await this.reactionCounter(e));
    const ai = await this.scorer.score(entries);
    const ranked = entries.map(e => {
      const { score, reason } = ai.get(e.id) || { score: 0, reason: '' };
      const final = score + this.cfg.reactionWeight * Math.min(reactions.get(e.id), 25);
      this.store.setEntryScore(e.id, score, final, reason);
      return { final, entry: e, reason };
    });
    ranked.sort((a, b) => (b.final - a.final) || (a.entry.id - b.entry.id));
    return ranked;
  }

  // Picks this week's winner and starts the veto window. Returns a status string.
  async runCycle(now = new Date()) {
    const week = this.currentWeek(now);
    this.store.setSetting('last_cycle_week', week);
    let ranked;
    try {
      ranked = await this.rank(week);
    } catch (e) {
      this.log.error('Student of the Week scoring failed', e);
      await this.notify('staff', `Student of the Week: scoring failed (${e.message}). Keeping the current banner.`);
      return 'scoring failed; kept current banner';
    }
    if (!ranked.length) {
      await this.notify('staff', `Student of the Week: no valid entries for ${week}. Keeping the current banner.`);
      return 'no entries; kept current banner';
    }
    return this.propose(week, ranked[0].entry, ranked[0].reason, now);
  }

  async propose(week, entry, reason, now) {
    const publishAt = new Date(now.getTime() + this.cfg.vetoHours * 3600000);
    const winner = this.store.addWinner(week, entry, reason, publishAt.toISOString());
    await this.notify('staff',
      `Student of the Week pick for ${week}: "${entry.title}" by ${entry.author} (entry #${entry.id}).\n`
      + `${entry.url}\nReason: ${reason || 'n/a'}\n`
      + `Goes live ${publishAt.toISOString().slice(0, 16).replace('T', ' ')} UTC. `
      + 'Use the veto command to stop it; the runner-up is then picked.');
    if (this.cfg.vetoHours <= 0) await this.publishDue(now);
    return `picked entry ${entry.id} (winner ${winner.id})`;
  }

  async publishDue(now = new Date()) {
    const pending = this.store.pendingWinner();
    if (!pending || this.store.isPaused()) return false;
    if (new Date(pending.publishAt) > now) return false;
    this.store.retireLive();
    this.store.setWinnerState(pending.id, 'live');
    this.publisher.write(pending);
    this.store.setEntryStatus(pending.entryId, 'won');
    await this.notify('announce', `This week's Student of the Week: "${pending.title}" by ${pending.author}\n${pending.url}\n${pending.reason || ''}`);
    await this.notify('hall', `Student of the Week ${pending.week}: "${pending.title}" by ${pending.author} - ${pending.url}`);
    return true;
  }

  // Cancels the pending pick and promotes the runner-up. Returns a status string.
  async veto(now = new Date()) {
    const pending = this.store.pendingWinner();
    if (!pending) return 'There is no pending pick to veto.';
    this.store.setWinnerState(pending.id, 'vetoed');
    this.store.setEntryStatus(pending.entryId, 'vetoed');
    const runners = this.store.validEntries(pending.week)
      .filter(e => !this.store.isOptout(e.userId))
      .sort((a, b) => ((b.finalScore || 0) - (a.finalScore || 0)) || (a.id - b.id));
    if (!runners.length) {
      await this.notify('staff', 'Vetoed. No runner-up, so the current banner stays.');
      return 'vetoed; no runner-up, current banner kept';
    }
    return this.propose(pending.week, runners[0], runners[0].reason, now);
  }

  // Kill switch: clear the winner and pause the cycle.
  revert() {
    this.store.setSetting('paused', '1');
    const pending = this.store.pendingWinner();
    if (pending) this.store.setWinnerState(pending.id, 'cancelled');
    this.store.retireLive();
    this.publisher.write(null);
  }

  resume() { this.store.setSetting('paused', '0'); }

  // Rewrite the output files from the store on startup.
  restorePublished() { this.publisher.write(this.store.liveWinner()); }
}

module.exports = { Engine };
