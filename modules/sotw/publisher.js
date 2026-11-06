// Writes the current winner to files and serves it over a small read-only HTTP endpoint.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { displayText } = require('./screening');

const DEFAULT_PAYLOAD = { active: false, title: '', author: '', url: '', reason: '', week: '' };

function atomicWrite(file, text) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

class Publisher {
  constructor(cfg) {
    this.cfg = cfg;
    this.jsonPath = path.join(cfg.dataDir, 'winner.json');
    this.txtPath = path.join(cfg.dataDir, 'winner.txt');
    this.version = 0;
  }

  payloadFor(winner) {
    if (!winner) return { ...DEFAULT_PAYLOAD };
    return {
      active: true,
      title: displayText(winner.title),
      author: displayText(winner.author, 24),
      url: winner.url,
      short_url: this.cfg.publicUrl ? this.cfg.publicUrl + '/student' : '',
      reason: displayText(winner.reason || '', 120),
      week: winner.week,
    };
  }

  write(winner) {
    fs.mkdirSync(this.cfg.dataDir, { recursive: true });
    this.version += 1;
    const payload = { ...this.payloadFor(winner), version: this.version, updated: new Date().toISOString() };
    atomicWrite(this.jsonPath, JSON.stringify(payload, null, 2));
    atomicWrite(this.txtPath, (payload.active ? `${payload.title} by ${payload.author}` : '') + '\n');
    return payload;
  }

  read() {
    try { return JSON.parse(fs.readFileSync(this.jsonPath, 'utf8')); } catch (e) { return { ...DEFAULT_PAYLOAD }; }
  }

  handler() {
    return (req, res) => {
      const send = (code, type, body, extra = {}) => {
        res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra });
        res.end(body);
      };
      if (req.method !== 'GET') return send(405, 'text/plain', 'Method not allowed');
      const route = (req.url || '').split('?')[0];
      if (route === '/healthz') return send(200, 'text/plain', 'ok');
      if (route === '/winner.json') return send(200, 'application/json', JSON.stringify(this.read()));
      if (route === '/winner.txt') {
        let text = '\n';
        try { text = fs.readFileSync(this.txtPath, 'utf8'); } catch (e) { /* no winner yet */ }
        return send(200, 'text/plain', text);
      }
      if (route === '/student') {
        const data = this.read();
        if (data.active && data.url) return send(302, 'text/plain', '', { Location: data.url });
        return send(200, 'text/plain', 'No Student of the Week is featured right now.');
      }
      return send(404, 'text/plain', 'Not found');
    };
  }

  startHttp() {
    return new Promise((resolve, reject) => {
      const server = http.createServer(this.handler());
      server.once('error', reject);
      server.listen(this.cfg.httpPort, this.cfg.httpHost, () => resolve(server));
    });
  }
}

module.exports = { Publisher, DEFAULT_PAYLOAD };
